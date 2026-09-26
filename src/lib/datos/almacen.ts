import "server-only";

import { Timestamp, type DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { TransaccionResumida } from "@/lib/amazon/finanzas";
import { contarEscrituras, contarLecturas } from "./consumo";
import type { Pedido } from "./tipos";
import type { Ficha } from "./fichas";
import type { LineaReembolso, LineaVenta } from "./ventas";

/*
 * In-memory mirror of the big collections (`pedidos`,
 * `transaccionesAmazon`, `productos`, `fichas`), so the app stays well inside the free
 * Spark quota (50,000 reads / 20,000 writes a day):
 *
 * - Reading: loaded once; afterwards only docs written since the last load are
 *   read (every write stamps `sincronizadoEn` / `actualizadoEn`). The version is
 *   the id of the latest `sincronizaciones` doc: while it doesn't change, a page
 *   load reads nothing from these collections.
 * - Writing: everything goes through `Escritor`, which skips docs identical to
 *   what's already stored and applies the committed writes to the mirror, so a
 *   sync never has to re-read what it just wrote.
 *
 * Lives on globalThis (survives dev hot reloads). Single server process — the
 * Railway deployment runs one instance — so no cross-instance invalidation.
 */

export type ColeccionAlmacen = "pedidos" | "transaccionesAmazon" | "productos" | "fichas";

export type TransaccionGuardada = TransaccionResumida & { sincronizadoEn?: Date };
export type ProductoGuardado = { asin: string; imagen: string | null; titulo: string | null; marketplaceId: string; actualizadoEn: Date };

type Almacen = {
  version: string | null;
  /** Docs stamped after this instant are read on the next refresh. */
  marca: Date | null;
  pedidos: Map<string, Pedido>;
  transaccionesAmazon: Map<string, TransaccionGuardada>;
  productos: Map<string, ProductoGuardado>;
  fichas: Map<string, Ficha>;
  /** Bumped on every change, to memoise derived views. */
  revision: number;
};

const g = globalThis as unknown as { __almacen?: Almacen; __almacenCargando?: Promise<void>; __almacenDerivado?: { revision: number; datos: DatosVentas } };

function almacen(): Almacen {
  const a = (g.__almacen ??= { version: null, marca: null, pedidos: new Map(), transaccionesAmazon: new Map(), productos: new Map(), fichas: new Map(), revision: 0 });
  // A mirror created by an older version of this code (dev hot reload) may lack a newer collection.
  for (const col of Object.keys(CAMPO_MARCA) as ColeccionAlmacen[]) a[col] ??= new Map() as never;
  return a;
}

/** Clock-skew margin between this server and the write stamps. */
const MARGEN_MS = 2 * 60_000;
const CAMPO_MARCA: Record<ColeccionAlmacen, string> = { pedidos: "sincronizadoEn", transaccionesAmazon: "sincronizadoEn", productos: "actualizadoEn", fichas: "actualizadoEn" };

/** Firestore Timestamps → Dates (top-level fields), so the mirror holds plain values. */
function aPlano(d: DocumentData): DocumentData {
  const r: DocumentData = {};
  for (const [k, v] of Object.entries(d)) r[k] = v instanceof Timestamp ? v.toDate() : v;
  return r;
}

async function refrescar(version: string) {
  const a = almacen();
  const db = adminDb();
  const desde = a.marca ? new Date(a.marca.getTime() - MARGEN_MS) : null;
  const nuevaMarca = new Date();
  await Promise.all(
    (Object.keys(CAMPO_MARCA) as ColeccionAlmacen[]).map(async (col) => {
      const ref = db.collection(col);
      const snap = await (desde ? ref.where(CAMPO_MARCA[col], ">", Timestamp.fromDate(desde)) : ref).get();
      contarLecturas(snap.size);
      const mapa = a[col] as Map<string, DocumentData>;
      for (const d of snap.docs) mapa.set(d.id, aPlano(d.data()));
    }),
  );
  a.version = version;
  a.marca = nuevaMarca;
  a.revision++;
}

/**
 * Brings the mirror up to the sync `version` (latest `sincronizaciones` doc id).
 * Reads Firestore only when that version differs from the one already loaded.
 */
export async function asegurarAlmacen(version: string | null) {
  const a = almacen();
  if (!version || a.version === version) return;
  // Concurrent callers share one refresh.
  g.__almacenCargando ??= refrescar(version).finally(() => (g.__almacenCargando = undefined));
  await g.__almacenCargando;
}

/** After a sync: its writes are already in the mirror, so just record the new version (no reads). */
export function fijarVersion(version: string) {
  const a = almacen();
  a.version = version;
  a.marca = new Date();
}

/** Something went wrong mid-write: forget everything and reload on next use. */
export function invalidarAlmacen() {
  g.__almacen = undefined;
  g.__almacenDerivado = undefined;
}

export const pedidosEnAlmacen = (): ReadonlyMap<string, Pedido> => almacen().pedidos;
export const transaccionesEnAlmacen = (): ReadonlyMap<string, TransaccionGuardada> => almacen().transaccionesAmazon;
export const productosEnAlmacen = (): ReadonlyMap<string, ProductoGuardado> => almacen().productos;
export const fichasEnAlmacen = (): ReadonlyMap<string, Ficha> => almacen().fichas;

// ---------- Writing ----------

/** Fields that change on every write and don't make a doc "different". */
const SELLOS = new Set(["sincronizadoEn", "actualizadoEn"]);

function normal(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(normal);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normal(x)]));
  return v;
}

/** Would merging `datos` into `actual` change anything (ignoring the write stamps)? */
function cambia(actual: DocumentData | undefined, datos: DocumentData): boolean {
  if (!actual) return true;
  return Object.entries(datos).some(([k, v]) => !SELLOS.has(k) && JSON.stringify(normal(actual[k])) !== JSON.stringify(normal(v)));
}

/**
 * Batches merge-writes to the mirrored collections, skipping unchanged docs.
 * Committed batches are applied to the mirror right away.
 */
export class Escritor {
  private pendientes = new Map<string, { col: ColeccionAlmacen; id: string; datos: DocumentData; reemplazar: boolean }>();

  /**
   * Queues a write; returns false (and queues nothing) if the doc wouldn't change. Merges into the stored doc,
   * unless `reemplazar`: then the doc is overwritten whole (nested maps included).
   */
  set(col: ColeccionAlmacen, id: string, datos: DocumentData, { reemplazar = false } = {}): boolean {
    const clave = `${col}/${id}`;
    const previo = this.pendientes.get(clave);
    const actual = { ...((almacen()[col] as Map<string, DocumentData>).get(id) ?? {}), ...(previo?.datos ?? {}) };
    const existe = (almacen()[col] as Map<string, DocumentData>).has(id) || !!previo;
    if (existe && !cambia(actual, datos)) return false;
    this.pendientes.set(clave, { col, id, datos: reemplazar ? datos : { ...(previo?.datos ?? {}), ...datos }, reemplazar: reemplazar || !!previo?.reemplazar });
    return true;
  }

  get cantidad() {
    return this.pendientes.size;
  }

  async confirmar() {
    const db = adminDb();
    const ops = [...this.pendientes.values()];
    this.pendientes.clear();
    const a = almacen();
    for (let i = 0; i < ops.length; i += 400) {
      const grupo = ops.slice(i, i + 400);
      const batch = db.batch();
      for (const o of grupo) {
        if (o.reemplazar) batch.set(db.collection(o.col).doc(o.id), o.datos);
        else batch.set(db.collection(o.col).doc(o.id), o.datos, { merge: true });
      }
      await batch.commit();
      contarEscrituras(grupo.length);
      for (const o of grupo) {
        const mapa = a[o.col] as Map<string, DocumentData>;
        mapa.set(o.id, o.reemplazar ? { ...o.datos } : { ...(mapa.get(o.id) ?? {}), ...o.datos });
      }
      a.revision++;
    }
  }
}

// ---------- Derived views for the dashboard ----------

export type DatosVentas = { lineas: LineaVenta[]; reembolsos: LineaReembolso[]; imagenes: Map<string, string> };

/** Sales lines, refunds and photos derived from the mirror (memoised until the next change). */
export async function datosVentas(version: string | null): Promise<DatosVentas> {
  await asegurarAlmacen(version);
  const a = almacen();
  if (g.__almacenDerivado?.revision === a.revision) return g.__almacenDerivado.datos;

  const lineas: LineaVenta[] = [...a.pedidos.values()].map((p) => ({
    amazonOrderId: p.amazonOrderId,
    fecha: p.fecha,
    marketplaceId: p.marketplaceId,
    estado: p.estado,
    sku: p.sku,
    asin: p.asin,
    titulo: p.titulo,
    unidades: p.unidades,
    ventaTotal: p.ventaTotal,
  }));
  const reembolsos: LineaReembolso[] = [...a.transaccionesAmazon.values()].flatMap((t) =>
    t.lineas
      .filter((l) => l.reembolso > 0)
      .map((l) => ({ amazonOrderId: t.orderId, fecha: t.fechaPublicacion, marketplaceId: t.marketplaceId, sku: l.sku, importe: l.reembolso })),
  );
  const imagenes = new Map<string, string>();
  for (const [asin, p] of a.productos) if (p.imagen) imagenes.set(asin, p.imagen);

  const datos = { lineas, reembolsos, imagenes };
  g.__almacenDerivado = { revision: a.revision, datos };
  return datos;
}
