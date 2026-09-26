import "server-only";

import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { calcularBeneficio, redondear, type Marketplace, type Pedido } from "@/lib/datos/tipos";
import { nombrePais } from "@/lib/datos/paises";
import { ivaIncluido } from "@/lib/datos/iva";
import { marketplaceConocido, marketplacePorNombre } from "@/lib/datos/marketplacesConocidos";
import { asegurarAlmacen, Escritor, fijarVersion, invalidarAlmacen, pedidosEnAlmacen, productosEnAlmacen, transaccionesEnAlmacen } from "@/lib/datos/almacen";
import { contarEscrituras, contarLecturas, volcarConsumo } from "@/lib/datos/consumo";
import { eventosFinancieros, imagenesCatalogo, marketplacesActivos, pedidosActualizados, type PedidoAmazon } from "./apis";
import { resumirEventos, type TransaccionResumida } from "./finanzas";
import { ahoraMenos3Min } from "./cliente";
import { eurPorUnidad } from "./tiposCambio";

/*
 * Sync with Amazon, incremental on two independent cursors:
 *
 * 1. Sellers API  → active marketplaces (config/marketplaces).
 * 2. Orders API   → orders UPDATED since the last sync (not just created: a
 *                   pending order gets its price, a cancellation flips its
 *                   status…). One `pedidos` doc per order line.
 * 3. Finances API → financial events POSTED since the last sync (sale charges
 *                   with their fees, refunds…), in `transaccionesAmazon`. Pulling
 *                   the event stream instead of asking per order also catches
 *                   refunds of old orders.
 * 4. Every order touched in 2 or 3 gets comisiones/reembolso/beneficio
 *    recomputed from ALL its stored transactions, so re-running is idempotent.
 * 5. Catalog Items API → main listing photo of every ASIN without one yet
 *    (`productos/{asin}`); once per ASIN, 20 per call.
 *
 * Quota-wise (free Spark plan): the existing data comes from the in-memory
 * mirror (lib/datos/almacen.ts), never from re-reading collections, and every
 * write goes through `Escritor`, which skips docs that didn't change — the
 * overlapping windows re-fetch many unchanged orders and transactions.
 *
 * Each cursor only advances when its stage completes; a failed stage is simply
 * retried from the same point next time.
 */

/** Finances re-reads this far back every sync: deferred transactions can change status after posting. */
const SOLAPE_FINANZAS_MS = 10 * 24 * 3600_000;
const SOLAPE_PEDIDOS_MS = 5 * 60_000;
const MAX_VENTANA_FINANZAS_MS = 179 * 24 * 3600_000;
/** A lock older than this is considered abandoned (e.g. the server restarted mid-sync). */
export const BLOQUEO_MS = 15 * 60_000;

export type ResultadoSync = {
  pedidosNuevos: number;
  pedidosActualizados: number;
  transacciones: number;
  /** Firestore docs actually written (unchanged ones are skipped). */
  escrituras: number;
  errores: string[] | null;
  duracionMs: number;
};

export class SyncEnCurso extends Error {}

function diasIniciales(): number {
  const n = Number(process.env.SYNC_DIAS_INICIALES);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 180) : 90;
}

const aFecha = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);

function trocear<T>(xs: T[], n: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < xs.length; i += n) res.push(xs.slice(i, i + n));
  return res;
}

async function tomarBloqueo(db: Firestore) {
  const ref = db.collection("config").doc("sync");
  await db.runTransaction(async (tx) => {
    const desde = aFecha((await tx.get(ref)).get("enCursoDesde"));
    contarLecturas(1);
    if (desde && Date.now() - desde.getTime() < BLOQUEO_MS) {
      throw new SyncEnCurso("Ya hay una sincronización en curso. Espera a que termine.");
    }
    tx.set(ref, { enCursoDesde: Timestamp.now() }, { merge: true });
  });
  contarEscrituras(1);
  return async () => {
    await ref.set({ enCursoDesde: FieldValue.delete() }, { merge: true });
    contarEscrituras(1);
  };
}

export async function sincronizar(): Promise<ResultadoSync> {
  const db = adminDb();
  const inicio = Date.now();
  const liberar = await tomarBloqueo(db);
  const errores: string[] = [];
  let pedidosNuevos = 0;
  let pedidosActualizadosN = 0;
  let transaccionesN = 0;
  let escrituras = 0;

  try {
    const ultima = (await db.collection("sincronizaciones").orderBy("fecha", "desc").limit(1).get()).docs[0];
    contarLecturas(1);
    // Existing orders/transactions come from the in-memory mirror (reads only what changed since it was loaded).
    await asegurarAlmacen(ultima?.id ?? null);
    let cursorPedidos = aFecha(ultima?.get("cursorPedidos"));
    let cursorFinanzas = aFecha(ultima?.get("cursorFinanzas"));
    const primeraVez = new Date(Date.now() - diasIniciales() * 24 * 3600_000);
    const tocados = new Set<string>();
    let pedidosTraidos: PedidoAmazon[] = [];

    // 1. Marketplaces
    const refMk = db.collection("config").doc("marketplaces");
    const guardados = ((await refMk.get()).get("lista") as Marketplace[] | undefined) ?? [];
    contarLecturas(1);
    let marketplaces = guardados;
    let sellersOk = false;
    try {
      marketplaces = (await marketplacesActivos()).map((p) => ({
        id: p.marketplace.id,
        codigoPais: p.marketplace.countryCode,
        pais: nombrePais(p.marketplace.countryCode),
        dominio: p.marketplace.domainName ?? "",
        moneda: p.marketplace.defaultCurrencyCode,
      }));
      sellersOk = true;
    } catch (e) {
      // Without the Sellers API role the orders still work: markets are taken from the orders themselves (step 2).
      errores.push(`Sellers API: ${mensaje(e)} (se usan los países de los propios pedidos)`);
    }

    // 2. Orders
    try {
      const hasta = ahoraMenos3Min();
      const desde = cursorPedidos ? new Date(cursorPedidos.getTime() - SOLAPE_PEDIDOS_MS) : primeraVez;
      // No Sellers API: ask for every market, so a country we haven't seen yet isn't missed.
      const pedidos = await pedidosActualizados(desde, hasta, sellersOk ? marketplaces.map((m) => m.id) : []);
      pedidosTraidos = pedidos;
      if (!sellersOk) {
        const conocidos = new Set(marketplaces.map((m) => m.id));
        const nuevos = [...new Set(pedidos.map((p) => p.salesChannel.marketplaceId ?? ""))]
          .filter((id) => id && !conocidos.has(id))
          .map((id) => marketplaceConocido(id) ?? { id, pais: id, codigoPais: "", dominio: "", moneda: "EUR" });
        marketplaces = [...marketplaces, ...nuevos];
      }
      const r = await guardarPedidos(pedidos, marketplaces);
      pedidosNuevos = r.nuevos;
      pedidosActualizadosN = pedidos.length;
      escrituras += r.escrituras;
      r.orderIds.forEach((id) => tocados.add(id));
      errores.push(...r.errores);
      // A failed order (e.g. no exchange rate) must be fetched again next time: keep the cursor.
      if (r.errores.length === 0) cursorPedidos = hasta;
    } catch (e) {
      errores.push(`Orders API: ${mensaje(e)}`);
    }

    // Markets: written only when the list actually changed.
    if (JSON.stringify(marketplaces) !== JSON.stringify(guardados)) {
      await refMk.set({ lista: marketplaces, actualizadoEn: Timestamp.now(), origen: sellersOk ? "sellers" : "pedidos" });
      contarEscrituras(1);
      escrituras++;
    }

    // 3. Finances
    try {
      const hasta = ahoraMenos3Min();
      let desde = cursorFinanzas ? new Date(cursorFinanzas.getTime() - SOLAPE_FINANZAS_MS) : primeraVez;
      if (hasta.getTime() - desde.getTime() > MAX_VENTANA_FINANZAS_MS) desde = new Date(hasta.getTime() - MAX_VENTANA_FINANZAS_MS);
      const resumidas: TransaccionResumida[] = resumirEventos(await eventosFinancieros(desde, hasta), marketplacePorNombre);
      const esc = new Escritor();
      for (const t of resumidas) {
        // The 10-day overlap brings back mostly unchanged transactions: only new or changed ones are written.
        if (esc.set("transaccionesAmazon", t.transactionId, { ...t, sincronizadoEn: new Date() })) tocados.add(t.orderId);
      }
      escrituras += esc.cantidad;
      await esc.confirmar();
      transaccionesN = resumidas.length;
      cursorFinanzas = hasta;
    } catch (e) {
      errores.push(`Finances API: ${mensaje(e)}`);
    }

    // 4. Recompute fees, refunds and profit of every touched order
    try {
      const r = await recalcularPedidos([...tocados]);
      errores.push(...r.errores);
      escrituras += r.escrituras;
    } catch (e) {
      errores.push(`Recalcular beneficio: ${mensaje(e)}`);
    }

    // 5. Listing photos (a failure here never blocks the sales data)
    try {
      const r = await descargarImagenes(pedidosTraidos);
      errores.push(...r.errores);
      escrituras += r.escrituras;
    } catch (e) {
      errores.push(`Catalog Items API (fotos): ${mensaje(e)}`);
    }

    const duracionMs = Date.now() - inicio;
    const doc = await db.collection("sincronizaciones").add({
      fecha: Timestamp.now(),
      pedidosNuevos,
      errores: errores.length ? errores : null,
      cursorPedidos: cursorPedidos ? Timestamp.fromDate(cursorPedidos) : null,
      cursorFinanzas: cursorFinanzas ? Timestamp.fromDate(cursorFinanzas) : null,
      pedidosActualizados: pedidosActualizadosN,
      transacciones: transaccionesN,
      escrituras,
      duracionMs,
    });
    contarEscrituras(1);
    // Every write above is already in the mirror: the new version needs no re-read.
    fijarVersion(doc.id);

    return { pedidosNuevos, pedidosActualizados: pedidosActualizadosN, transacciones: transaccionesN, escrituras, errores: errores.length ? errores : null, duracionMs };
  } catch (e) {
    // Unknown state between Firestore and the mirror: reload it next time rather than trust it.
    invalidarAlmacen();
    throw e;
  } finally {
    await liberar();
    await volcarConsumo(true).catch(() => {});
  }
}

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function costesVigentes(): Promise<Map<string, number>> {
  const snap = await adminDb().collection("costesProducto").get();
  contarLecturas(snap.size);
  return new Map(snap.docs.map((d) => [d.get("sku") as string, d.get("costeUnitario") as number]));
}

async function guardarPedidos(pedidos: PedidoAmazon[], marketplaces: Marketplace[]) {
  const costes = await costesVigentes();
  const porId = new Map(marketplaces.map((m) => [m.id, m]));
  const existentes = pedidosEnAlmacen();
  const errores: string[] = [];
  const orderIds: string[] = [];
  let nuevos = 0;
  const esc = new Escritor();

  for (const p of pedidos) {
    const fecha = new Date(p.createdTime);
    const marketplaceId = p.salesChannel.marketplaceId ?? "";
    const mk = porId.get(marketplaceId);
    let esNuevo = true;
    try {
      const lineas: Pedido[] = [];
      for (const item of p.orderItems) {
        const id = `${p.orderId}_${item.orderItemId}`;
        const previo = existentes.get(id);
        if (previo) esNuevo = false;

        const precio = item.product?.price?.unitPrice;
        const total = item.proceeds?.proceedsTotal;
        const moneda = total?.currencyCode ?? precio?.currencyCode ?? mk?.moneda ?? "EUR";
        const tipoCambio = await eurPorUnidad(moneda, fecha);
        // Pending orders carry no proceeds yet: fall back to list price × units.
        const ventaOriginal = total ? Number(total.amount) : Number(precio?.amount ?? 0) * item.quantityOrdered;
        const desgloseIva = (item.proceeds?.breakdowns ?? []).filter((b) => b.type === "TAX");

        const sku = item.product?.sellerSku ?? "";
        const costeUnitario = costes.get(sku);
        const costeProducto = previo?.costeProducto ?? (costeUnitario !== undefined ? redondear(costeUnitario * item.quantityOrdered) : null);
        const comisionesAmazon = previo?.comisionesAmazon ?? 0;
        const reembolso = previo?.reembolso ?? 0;
        const impuestosReembolso = previo?.impuestosReembolso ?? 0;
        const ventaTotal = redondear(ventaOriginal * tipoCambio);
        // VAT: as reported by the Orders API if it breaks it out, otherwise estimated from the country's
        // standard rate. Once Amazon settles the sale, recalcularPedidos replaces it with the settled VAT.
        const ivaInformado = desgloseIva.length > 0 ? desgloseIva.reduce((s, b) => s + Number(b.subtotal.amount), 0) : null;
        const ivaCalculado = ivaInformado ?? ivaIncluido(ventaOriginal, mk?.codigoPais);
        // A settled line keeps the VAT from its settlement (recalcularPedidos), not this estimate.
        const liquidado = previo?.liquidado ?? false;
        const impuestos = liquidado && previo ? previo.impuestos : redondear((ivaCalculado ?? 0) * tipoCambio);
        const ivaEstimado = liquidado && previo ? previo.ivaEstimado : ivaInformado === null;

        lineas.push({
          id,
          amazonOrderId: p.orderId,
          orderItemId: item.orderItemId,
          fecha,
          marketplaceId,
          pais: mk?.pais ?? p.salesChannel.marketplaceName ?? marketplaceId,
          estado: p.fulfillment?.fulfillmentStatus ?? "DESCONOCIDO",
          sku,
          asin: item.product?.asin ?? "",
          titulo: item.product?.title ?? "",
          unidades: item.quantityOrdered,
          ventaTotal,
          impuestos,
          ivaEstimado,
          comisionesAmazon,
          reembolso,
          impuestosReembolso,
          costeProducto,
          beneficioNeto: calcularBeneficio({ ventaTotal, impuestos, comisionesAmazon, reembolso, impuestosReembolso, costeProducto }),
          liquidado,
          moneda,
          tipoCambio,
          sincronizadoEn: new Date(),
        });
      }
      let cambiado = false;
      for (const l of lineas) cambiado = esc.set("pedidos", l.id, l) || cambiado;
      if (esNuevo) nuevos++;
      // Unchanged orders don't need their fees recomputed either.
      if (cambiado) orderIds.push(p.orderId);
    } catch (e) {
      errores.push(`Pedido ${p.orderId}: ${mensaje(e)}`);
    }
  }
  const escrituras = esc.cantidad;
  await esc.confirmar();
  return { nuevos, orderIds, errores, escrituras };
}

/**
 * Rebuilds comisiones/reembolso/IVA/liquidado/beneficio of these orders from all their stored transactions.
 * VAT from the settled sale replaces the Orders API / estimated one; refunds that don't break out their
 * VAT are assumed to carry the same VAT share as the sale. Works on the in-memory mirror; writes only
 * lines whose figures change.
 */
export async function recalcularPedidos(orderIds: string[]): Promise<{ errores: string[]; escrituras: number }> {
  const errores: string[] = [];
  if (orderIds.length === 0) return { errores, escrituras: 0 };
  const buscados = new Set(orderIds);
  const lineasPorPedido = new Map<string, Pedido[]>();
  for (const l of pedidosEnAlmacen().values()) {
    if (buscados.has(l.amazonOrderId)) lineasPorPedido.set(l.amazonOrderId, [...(lineasPorPedido.get(l.amazonOrderId) ?? []), l]);
  }
  const txPorPedido = new Map<string, TransaccionResumida[]>();
  for (const t of transaccionesEnAlmacen().values()) {
    if (buscados.has(t.orderId)) txPorPedido.set(t.orderId, [...(txPorPedido.get(t.orderId) ?? []), t]);
  }

  const esc = new Escritor();
  for (const [orderId, lineas] of lineasPorPedido) {
    try {
      type Acumulado = { comisiones: number; reembolso: number; ivaVenta: number | null; ivaReembolso: number; reembolsoSinIva: number };
      const acumulado = new Map<string, Acumulado>(lineas.map((l) => [l.id, { comisiones: 0, reembolso: 0, ivaVenta: null, ivaReembolso: 0, reembolsoSinIva: 0 }]));
      const txs = txPorPedido.get(orderId) ?? [];
      for (const t of txs) {
        for (const tl of t.lineas) {
          const destino = tl.sku ? lineas.filter((l) => l.sku === tl.sku) : [];
          const reparto = destino.length ? destino : lineas; // no SKU / unknown SKU → whole order
          const pesoTotal = reparto.reduce((s, l) => s + Math.max(l.ventaTotal, 0), 0);
          for (const l of reparto) {
            const peso = pesoTotal > 0 ? Math.max(l.ventaTotal, 0) / pesoTotal : 1 / reparto.length;
            const cambio = t.moneda === l.moneda ? l.tipoCambio : await eurPorUnidad(t.moneda, t.fechaPublicacion);
            const a = acumulado.get(l.id)!;
            a.comisiones += tl.comisiones * peso * cambio;
            a.reembolso += tl.reembolso * peso * cambio;
            const iva = tl.iva ?? null; // transactions stored before VAT tracking have no field
            if (t.esCargoVenta && iva !== null) a.ivaVenta = (a.ivaVenta ?? 0) + iva * peso * cambio;
            if (tl.reembolso !== 0) {
              if (iva !== null) a.ivaReembolso += iva * peso * cambio;
              else a.reembolsoSinIva += tl.reembolso * peso * cambio;
            }
          }
        }
      }
      const liquidado = txs.some((t) => t.esCargoVenta);
      for (const d of lineas) {
        const a = acumulado.get(d.id)!;
        const comisionesAmazon = redondear(a.comisiones);
        const reembolso = redondear(a.reembolso);
        const impuestos = a.ivaVenta !== null ? redondear(a.ivaVenta) : (d.impuestos ?? 0);
        const ivaEstimado = a.ivaVenta !== null ? false : (d.ivaEstimado ?? true);
        const cuotaIva = d.ventaTotal > 0 ? impuestos / d.ventaTotal : 0;
        const impuestosReembolso = redondear(a.ivaReembolso + a.reembolsoSinIva * cuotaIva);
        const beneficioNeto = calcularBeneficio({ ventaTotal: d.ventaTotal, impuestos, comisionesAmazon, reembolso, impuestosReembolso, costeProducto: d.costeProducto });
        esc.set("pedidos", d.id, { comisionesAmazon, reembolso, impuestos, ivaEstimado, impuestosReembolso, liquidado, beneficioNeto, sincronizadoEn: new Date() });
      }
    } catch (e) {
      errores.push(`Pedido ${orderId}: ${mensaje(e)}`);
    }
  }
  const escrituras = esc.cantidad;
  await esc.confirmar();
  return { errores, escrituras };
}

/** Fills the cost of lines saved before this SKU had one (lines that already have a cost are never touched). */
export async function aplicarCosteAPedidosSinCoste(sku: string, costeUnitario: number): Promise<number> {
  const esc = new Escritor();
  for (const p of pedidosEnAlmacen().values()) {
    if (p.sku !== sku || p.costeProducto !== null) continue;
    const costeProducto = redondear(costeUnitario * p.unidades);
    esc.set("pedidos", p.id, {
      costeProducto,
      beneficioNeto: calcularBeneficio({ ...p, impuestosReembolso: p.impuestosReembolso ?? 0, costeProducto }),
      sincronizadoEn: new Date(),
    });
  }
  const n = esc.cantidad;
  await esc.confirmar();
  return n;
}

/**
 * Fetches the listing photo of sold ASINs still missing from `productos`, grouped by the marketplace they sold
 * in. Candidates come from the in-memory mirror plus this run's orders: no collection is read.
 */
async function descargarImagenes(pedidosTraidos: PedidoAmazon[]): Promise<{ errores: string[]; escrituras: number }> {
  const conocidos = productosEnAlmacen();
  const pendientes = new Map<string, string>(); // asin → marketplace where it sold
  const anotar = (asin: string | undefined, mk: string) => {
    if (asin && !conocidos.has(asin) && !pendientes.has(asin)) pendientes.set(asin, mk);
  };
  for (const l of pedidosEnAlmacen().values()) anotar(l.asin, l.marketplaceId);
  for (const p of pedidosTraidos) for (const i of p.orderItems) anotar(i.product?.asin, p.salesChannel.marketplaceId ?? "");

  const porMarketplace = new Map<string, string[]>();
  for (const [asin, mk] of pendientes) porMarketplace.set(mk, [...(porMarketplace.get(mk) ?? []), asin]);

  let escrituras = 0;
  for (const [marketplaceId, asins] of porMarketplace) {
    for (const lote of trocear(asins, 20)) {
      try {
        const items = await imagenesCatalogo(lote, marketplaceId);
        // ASINs Amazon didn't return (e.g. closed listings) are stored without photo so they aren't asked for again.
        const porAsin = new Map(items.map((i) => [i.asin, i]));
        const esc = new Escritor();
        for (const asin of lote) {
          esc.set("productos", asin, { asin, imagen: porAsin.get(asin)?.imagen ?? null, titulo: porAsin.get(asin)?.titulo ?? null, marketplaceId, actualizadoEn: new Date() });
        }
        escrituras += esc.cantidad;
        await esc.confirmar();
      } catch (e) {
        // Nothing stored: these ASINs are retried on the next sync.
        return { errores: [`Catalog Items API (fotos): ${mensaje(e)}`], escrituras };
      }
    }
  }
  return { errores: [], escrituras };
}
