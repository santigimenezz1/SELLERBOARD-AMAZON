import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { aplicarCosteAPedidosSinCoste } from "@/lib/amazon/sincronizar";
import { datosVentas } from "./cache";
import { cargarUltimaSync } from "./panel";
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
  const ultima = await cargarUltimaSync();
  const [{ lineas }, costes] = await Promise.all([datosVentas(ultima?.id ?? null), adminDb().collection("costesProducto").get()]);

  const porSku = new Map<string, SkuConCoste>();
  for (const l of lineas) {
    const s = porSku.get(l.sku) ?? { sku: l.sku, titulo: l.titulo, asin: l.asin, unidades: 0, costeUnitario: null, actualizadoEn: null };
    if (l.estado !== "CANCELLED") s.unidades += l.unidades;
    porSku.set(l.sku, s);
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
