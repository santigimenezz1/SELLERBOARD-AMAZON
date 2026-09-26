import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { aplicarCosteAPedidosSinCoste } from "@/lib/amazon/sincronizar";
import { idDocSku, redondear } from "./tipos";

export type SkuConCoste = {
  sku: string;
  titulo: string;
  asin: string;
  unidades: number;
  costeUnitario: number | null;
  actualizadoEn: string | null;
};

/** Every SKU that has appeared in an order, with its current cost (if any). */
export async function listarSkus(): Promise<SkuConCoste[]> {
  const db = adminDb();
  const [pedidos, costes] = await Promise.all([db.collection("pedidos").select("sku", "titulo", "asin", "unidades", "estado").get(), db.collection("costesProducto").get()]);

  const porSku = new Map<string, SkuConCoste>();
  for (const d of pedidos.docs) {
    const sku = d.get("sku") as string;
    const s = porSku.get(sku) ?? { sku, titulo: d.get("titulo") as string, asin: d.get("asin") as string, unidades: 0, costeUnitario: null, actualizadoEn: null };
    if (d.get("estado") !== "CANCELLED") s.unidades += d.get("unidades") as number;
    porSku.set(sku, s);
  }
  for (const d of costes.docs) {
    const s = porSku.get(d.get("sku") as string);
    if (!s) continue;
    s.costeUnitario = d.get("costeUnitario") as number;
    s.actualizadoEn = (d.get("actualizadoEn") as Timestamp).toDate().toISOString();
  }
  // Missing costs first, then best sellers.
  return [...porSku.values()].sort((a, b) => Number(a.costeUnitario !== null) - Number(b.costeUnitario !== null) || b.unidades - a.unidades);
}

/**
 * Saves the current unit cost of a SKU. Orders synced from now on use it.
 * Lines that already have a cost keep theirs (no retroactive change); lines
 * that had NO cost at all get this one, since there was no earlier value to
 * preserve and they would otherwise stay as "falta coste" forever.
 */
export async function guardarCoste(sku: string, costeUnitario: number): Promise<{ pedidosCompletados: number }> {
  const db = adminDb();
  const coste = redondear(costeUnitario);
  await db.collection("costesProducto").doc(idDocSku(sku)).set({ sku, costeUnitario: coste, actualizadoEn: Timestamp.now() });
  const pedidosCompletados = await aplicarCosteAPedidosSinCoste(db, sku, coste);
  return { pedidosCompletados };
}
