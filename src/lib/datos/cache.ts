import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { TransaccionResumida } from "@/lib/amazon/finanzas";
import type { LineaReembolso, LineaVenta } from "./ventas";

/*
 * In-memory copy of the sales data, so a dashboard load costs ~4 Firestore
 * reads instead of one per order line (the free Spark plan allows 50,000
 * reads a day, and a few dozen full loads used them up).
 *
 * The data only changes when a sync runs, and every sync leaves a doc in
 * `sincronizaciones`: the id of the latest one is the cache version. When it
 * changes, only the docs written since the previous load are read — every
 * sync write stamps `sincronizadoEn` — and merged in.
 *
 * Lives on globalThis so it survives dev hot reloads. Single-user app, single
 * server process: no cross-instance invalidation needed.
 */

type Cache = {
  version: string | null;
  /** Docs with sincronizadoEn after this instant are read on the next refresh. */
  marca: Timestamp | null;
  lineas: Map<string, LineaVenta>;
  /** Refund lines per transaction id (a re-read transaction replaces its entries). */
  reembolsos: Map<string, LineaReembolso[]>;
  /** Every ASIN with a `productos` doc, and its photo when it has one. */
  productos: Map<string, string | null>;
};

const g = globalThis as unknown as { __cacheVentas?: Cache; __cacheVentasCargando?: Promise<void> };
const cache = (): Cache => (g.__cacheVentas ??= { version: null, marca: null, lineas: new Map(), reembolsos: new Map(), productos: new Map() });

/** Clock-skew margin between this server and Firestore's timestamps. */
const MARGEN_MS = 2 * 60_000;

async function refrescar(version: string) {
  const c = cache();
  const db = adminDb();
  const desde = c.marca ? Timestamp.fromMillis(c.marca.toMillis() - MARGEN_MS) : null;
  const nuevaMarca = Timestamp.now();

  const pedidos = db.collection("pedidos");
  const txs = db.collection("transaccionesAmazon");
  const productos = db.collection("productos");
  const [snapPedidos, snapTxs, snapProductos] = await Promise.all([
    (desde ? pedidos.where("sincronizadoEn", ">", desde) : pedidos)
      .select("amazonOrderId", "fecha", "marketplaceId", "estado", "sku", "asin", "titulo", "unidades", "ventaTotal")
      .get(),
    (desde ? txs.where("sincronizadoEn", ">", desde) : txs).get(),
    (desde ? productos.where("actualizadoEn", ">", desde) : productos).select("imagen").get(),
  ]);

  for (const d of snapPedidos.docs) {
    const x = d.data();
    c.lineas.set(d.id, { ...(x as Omit<LineaVenta, "fecha">), fecha: (x.fecha as Timestamp).toDate() });
  }
  for (const d of snapTxs.docs) {
    const t = d.data() as Omit<TransaccionResumida, "fechaPublicacion"> & { fechaPublicacion: Timestamp };
    c.reembolsos.set(
      d.id,
      t.lineas
        .filter((l) => l.reembolso > 0)
        .map((l) => ({ amazonOrderId: t.orderId, fecha: t.fechaPublicacion.toDate(), marketplaceId: t.marketplaceId, sku: l.sku, importe: l.reembolso })),
    );
  }
  for (const d of snapProductos.docs) c.productos.set(d.id, (d.get("imagen") as string | null) ?? null);

  c.version = version;
  c.marca = nuevaMarca;
}

/**
 * Sales data as of the sync `version` (the latest `sincronizaciones` doc id).
 * Reads Firestore only when that version changed since the last call.
 */
export async function datosVentas(version: string | null): Promise<{ lineas: LineaVenta[]; reembolsos: LineaReembolso[]; imagenes: Map<string, string> }> {
  const c = cache();
  if (version && c.version !== version) {
    // Concurrent page loads share one refresh.
    g.__cacheVentasCargando ??= refrescar(version).finally(() => (g.__cacheVentasCargando = undefined));
    await g.__cacheVentasCargando;
  }
  const imagenes = new Map<string, string>();
  for (const [asin, img] of c.productos) if (img) imagenes.set(asin, img);
  return { lineas: [...c.lineas.values()], reembolsos: [...c.reembolsos.values()].flat(), imagenes };
}

/** What the cache already knows, without touching Firestore (used by the sync to decide which photos to fetch). */
export function lineasEnCache(): { lineas: LineaVenta[]; asinsConProducto: Set<string> } {
  const c = cache();
  return { lineas: [...c.lineas.values()], asinsConProducto: new Set(c.productos.keys()) };
}
