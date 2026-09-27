import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { devolucionesFBA, type DevolucionAmazon } from "@/lib/amazon/apis";
import { pedidosEnAlmacen, transaccionesEnAlmacen } from "./almacen";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * FBA customer returns (with the customer's reason and the unit's condition),
 * from Amazon's returns report. All rows in one doc, `config/devoluciones`,
 * read once per server process. The report is slow to build (~20 s), so the
 * sync refreshes it at most every few hours, re-reading a window that
 * overlaps the previous one; the first time it looks back a full year.
 */

const REFRESCO_MS = 6 * 3600_000;
const SOLAPE_DIAS = 45;
const HISTORICO_DIAS = 365;
const DIA_MS = 86_400_000;

type Doc = { filas: DevolucionAmazon[]; actualizadoEn: string };
const g = globalThis as unknown as { __devoluciones?: Doc | null };
const ref = () => adminDb().collection("config").doc("devoluciones");
const clave = (d: DevolucionAmazon) => `${d.orderId}|${d.sku}|${d.lpn}|${d.fecha}`;

async function leer(): Promise<Doc | null> {
  if (g.__devoluciones !== undefined) return g.__devoluciones;
  const snap = await ref().get();
  contarLecturas(1);
  g.__devoluciones = snap.exists ? { filas: (snap.get("filas") as DevolucionAmazon[]) ?? [], actualizadoEn: snap.get("actualizadoEn") as string } : null;
  return g.__devoluciones;
}

/** Sync stage. Returns the writes done (0 when skipped or unchanged). */
export async function actualizarDevoluciones(marketplaceId: string): Promise<number> {
  const actual = await leer();
  if (actual && Date.now() - new Date(actual.actualizadoEn).getTime() < REFRESCO_MS) return 0;
  const desde = new Date(Date.now() - (actual ? SOLAPE_DIAS : HISTORICO_DIAS) * DIA_MS);
  const nuevas = await devolucionesFBA(marketplaceId, desde);
  const limite = new Date(Date.now() - HISTORICO_DIAS * DIA_MS).toISOString();
  const porClave = new Map((actual?.filas ?? []).map((d) => [clave(d), d]));
  for (const d of nuevas) porClave.set(clave(d), d);
  const filas = [...porClave.values()].filter((d) => d.fecha >= limite).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const doc: Doc = { filas, actualizadoEn: new Date().toISOString() };
  // Even with no new rows the refresh time is stored, so the report isn't requested again for a while.
  await ref().set(doc);
  contarEscrituras(1);
  g.__devoluciones = doc;
  return 1;
}

export type FilaDevolucion = { fecha: string; marketplaceId: string | null; unidades: number; motivo: string; disposicion: string; estado: string; comentario: string };
export type FilaReembolso = { fecha: string; marketplaceId: string | null; importe: number };
export type FilaVenta = { dia: string; marketplaceId: string; unidades: number };
/**
 * `generadoEn` (ms) anchors the periods, so the server and browser renders filter the same rows.
 * `inicioDatos` is the first synced financial event: before it there are returns but no sales or refunds to compare with.
 */
export type DevolucionesProducto = { devoluciones: FilaDevolucion[]; reembolsos: FilaReembolso[]; ventas: FilaVenta[]; actualizadoEn: string | null; generadoEn: number; inicioDatos: string | null };

/**
 * Everything the returns box of one product needs for the last year, per marketplace, so the page can
 * switch period and country without another request: physical returns (country taken from the order),
 * refunds (from the financial events; amount in euros from the order line) and units sold per day.
 */
export async function devolucionesDeProducto(asin: string, skus: string[]): Promise<DevolucionesProducto> {
  const doc = await leer();
  const desde = new Date(Date.now() - HISTORICO_DIAS * DIA_MS);
  const todos = [...pedidosEnAlmacen().values()];
  const pedidos = todos.filter((p) => p.asin === asin);
  // Any order line gives the country (the return row's ASIN may not match the order line's).
  const mkDePedido = new Map(todos.map((p) => [p.amazonOrderId, p.marketplaceId]));
  // Financial events are fetched by posting date, so they are complete from the first sync on; orders are
  // fetched by last update, so a few much older ones (updated lately) would fake an earlier start.
  let inicioDatos: Date | null = null;
  for (const t of transaccionesEnAlmacen().values()) if (!inicioDatos || t.fechaPublicacion < inicioDatos) inicioDatos = t.fechaPublicacion;

  const devoluciones = (doc?.filas ?? [])
    .filter((d) => d.asin === asin || skus.includes(d.sku))
    .map((d) => ({ fecha: d.fecha, marketplaceId: mkDePedido.get(d.orderId) ?? null, unidades: d.unidades, motivo: d.motivo, disposicion: d.disposicion, estado: d.estado, comentario: d.comentario }));

  // One refund per order: the first refund event of that order for this product.
  const reembolsados = new Map<string, FilaReembolso>();
  for (const t of transaccionesEnAlmacen().values()) {
    if (t.fechaPublicacion < desde || !t.lineas.some((l) => l.reembolso > 0 && l.sku && skus.includes(l.sku))) continue;
    const previo = reembolsados.get(t.orderId);
    if (previo && previo.fecha <= t.fechaPublicacion.toISOString()) continue;
    const importe = pedidos.filter((p) => p.amazonOrderId === t.orderId).reduce((s, p) => s + p.reembolso, 0);
    reembolsados.set(t.orderId, { fecha: t.fechaPublicacion.toISOString(), marketplaceId: t.marketplaceId ?? mkDePedido.get(t.orderId) ?? null, importe: Math.round(importe * 100) / 100 });
  }

  const ventas = new Map<string, FilaVenta>();
  for (const p of pedidos) {
    if (p.estado === "CANCELLED" || p.fecha < desde) continue;
    const dia = p.fecha.toISOString().slice(0, 10);
    const v = ventas.get(`${dia}|${p.marketplaceId}`) ?? { dia, marketplaceId: p.marketplaceId, unidades: 0 };
    v.unidades += p.unidades;
    ventas.set(`${dia}|${p.marketplaceId}`, v);
  }

  return { devoluciones, reembolsos: [...reembolsados.values()], ventas: [...ventas.values()], actualizadoEn: doc?.actualizadoEn ?? null, generadoEn: Date.now(), inicioDatos: inicioDatos?.toISOString() ?? null };
}
