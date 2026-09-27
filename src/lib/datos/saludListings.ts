import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { estadoListing, sellerIdPropio, type EstadoListing } from "@/lib/amazon/apis";
import { pedidosEnAlmacen } from "./almacen";
import { obtenerStock } from "./stock";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * Listing health: status and open issues (suppressions, missing attributes,
 * compliance warnings…) of every active SKU in every marketplace with sales,
 * from the Listings Items API. One doc, `config/saludListings`, rewritten by
 * the sync only when something changed.
 */

type Doc = { sellerId: string | null; items: Record<string, EstadoListing>; comprobadoEn: string | null };
const g = globalThis as unknown as { __saludListings?: Doc };
const ref = () => adminDb().collection("config").doc("saludListings");
const clave = (sku: string, mk: string) => `${sku}|${mk}`;
const DIAS_ACTIVO = 90;
/** Issues not worth showing: 100613 = price above the Amazon Haul (low-price store) cap, irrelevant for this catalogue. */
const IGNORADOS = new Set(["100613"]);

async function leer(): Promise<Doc> {
  if (g.__saludListings) return g.__saludListings;
  const snap = await ref().get();
  contarLecturas(1);
  g.__saludListings = {
    sellerId: (snap.get("sellerId") as string | undefined) ?? null,
    items: (snap.get("items") as Record<string, EstadoListing> | undefined) ?? {},
    comprobadoEn: (snap.get("comprobadoEn") as string | undefined) ?? null,
  };
  return g.__saludListings;
}

/** Sync stage: SKUs sold lately or with sellable stock × marketplaces with sales. Returns writes done. */
export async function actualizarSaludListings(marketplaceIds: string[]): Promise<number> {
  const actual = await leer();
  const desde = new Date(Date.now() - DIAS_ACTIVO * 86_400_000);
  const vendidos = [...pedidosEnAlmacen().values()].filter((p) => p.fecha >= desde && p.sku);
  const skus = new Set(vendidos.map((p) => p.sku));
  for (const a of (await obtenerStock())?.articulos ?? []) if (Object.values(a.porRegion).some((c) => c.vendible > 0)) skus.add(a.sku);
  if (skus.size === 0 || marketplaceIds.length === 0) return 0;

  let sellerId = actual.sellerId;
  if (!sellerId) {
    const conVenta = vendidos.find((p) => marketplaceIds.includes(p.marketplaceId));
    for (const [sku, mk] of [[conVenta?.sku, conVenta?.marketplaceId], ...[...skus].map((s) => [s, marketplaceIds[0]])]) {
      if (sku && mk) sellerId = await sellerIdPropio(sku, mk).catch(() => null);
      if (sellerId) break;
    }
    if (!sellerId) throw new Error("no se pudo averiguar tu id de vendedor (ninguna oferta propia encontrada)");
  }

  const items: Record<string, EstadoListing> = {};
  for (const sku of skus) {
    for (const mk of marketplaceIds) {
      const e = await estadoListing(sellerId, sku, mk);
      if (e) items[clave(sku, mk)] = e;
    }
  }
  const doc: Doc = { sellerId, items, comprobadoEn: new Date().toISOString() };
  const cambio = sellerId !== actual.sellerId || JSON.stringify(items) !== JSON.stringify(actual.items);
  g.__saludListings = doc;
  if (!cambio) return 0;
  await ref().set(doc);
  contarEscrituras(1);
  return 1;
}

export type ProblemaProducto = { sku: string; codigo: string; severidad: string; mensaje: string; suprimido: boolean };
export type SaludProducto = {
  /** Per marketplace id: its problems (empty = all good), whether it's buyable, and whether it's listed at all. */
  porMercado: Record<string, { comprable: boolean; problemas: ProblemaProducto[] }>;
  comprobadoEn: string | null;
};

// Compliance issues (extended producer responsibility / RER, regulatory information): Seller Central counts
// them under «Cumplimiento normativo», which the performance report doesn't carry.
const NORMATIVO = /\bRER\b|\bEPR\b|responsabilidad ampliada|normativ|regulator|cumplimiento/i;

/** Per marketplace: open compliance issues of any SKU (deduplicated by message). */
export async function problemasNormativos(): Promise<Record<string, ProblemaProducto[]>> {
  const doc = await leer();
  const res: Record<string, ProblemaProducto[]> = {};
  for (const [k, e] of Object.entries(doc.items)) {
    const [sku, mk] = k.split("|");
    for (const p of e.problemas) {
      if (IGNORADOS.has(p.codigo) || !NORMATIVO.test(p.mensaje)) continue;
      const lista = (res[mk] ??= []);
      if (!lista.some((x) => x.mensaje === p.mensaje)) lista.push({ sku, codigo: p.codigo, severidad: p.severidad, mensaje: p.mensaje, suprimido: p.acciones.some((a) => a.includes("SUPPRESS")) });
    }
  }
  return res;
}

/** Health of one product (all its SKUs) in each marketplace where it is listed. */
export async function saludDeProducto(skus: string[]): Promise<SaludProducto> {
  const doc = await leer();
  const porMercado: SaludProducto["porMercado"] = {};
  for (const [k, e] of Object.entries(doc.items)) {
    const [sku, mk] = k.split("|");
    if (!skus.includes(sku)) continue;
    const m = (porMercado[mk] ??= { comprable: false, problemas: [] });
    m.comprable ||= e.estado.includes("BUYABLE");
    for (const p of e.problemas) {
      if (IGNORADOS.has(p.codigo) || m.problemas.some((x) => x.mensaje === p.mensaje)) continue;
      m.problemas.push({ sku, codigo: p.codigo, severidad: p.severidad, mensaje: p.mensaje, suprimido: p.acciones.some((a) => a.includes("SUPPRESS")) });
    }
  }
  // Errors first.
  for (const m of Object.values(porMercado)) m.problemas.sort((a, b) => Number(b.severidad === "ERROR") - Number(a.severidad === "ERROR"));
  return { porMercado, comprobadoEn: doc.comprobadoEn };
}
