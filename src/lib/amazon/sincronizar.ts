import "server-only";

import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { calcularBeneficio, redondear, type Marketplace, type Pedido } from "@/lib/datos/tipos";
import { nombrePais } from "@/lib/datos/paises";
import { ivaIncluido } from "@/lib/datos/iva";
import { marketplaceConocido, marketplacePorNombre } from "@/lib/datos/marketplacesConocidos";
import { asegurarAlmacen, Escritor, fijarVersion, invalidarAlmacen, pedidosEnAlmacen, productosEnAlmacen, transaccionesEnAlmacen } from "@/lib/datos/almacen";
import { contarEscrituras, contarLecturas, volcarConsumo } from "@/lib/datos/consumo";
import { recordarUltimaSync } from "@/lib/datos/panel";
import { avisarVentas } from "@/lib/telegram";
import { actualizarStock } from "@/lib/datos/stock";
import { actualizarFichas } from "@/lib/datos/fichas";
import { actualizarDevoluciones } from "@/lib/datos/devoluciones";
import { actualizarSaludListings } from "@/lib/datos/saludListings";
import { actualizarEnvios } from "@/lib/datos/envios";
import { actualizarInventarioPaises } from "@/lib/datos/inventarioPaises";
import { actualizarEstadoCuenta } from "@/lib/datos/estadoCuenta";
import { sincronizarGmail } from "@/lib/gmail";
import { actualizarGastos } from "@/lib/datos/gastos";
import { actualizarIngresos, guardarCompensaciones } from "@/lib/datos/ingresos";
import { actualizarSaldos } from "@/lib/datos/saldos";
import { eventosFinancieros, imagenesCatalogo, marketplacesActivos, pedidosActualizados, type PedidoAmazon } from "./apis";
import { muestrasTarifas, resumirEventos, type TransaccionResumida } from "./finanzas";
import { guardarTarifas, tarifasCreadas } from "@/lib/datos/tarifasVenta";
import { cargosDeEnvios, guardarCargosEnvios, obtenerCostesEnvios } from "@/lib/datos/costesEnvios";
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
 * 6. FBA Inventory API → stock snapshot per region (`config/stock`), written
 *    only when it changed.
 * 7. Catalog + Pricing → listing cards (`fichas/{asin}`) of the marketplaces with
 *    sales: catalog once a day, prices every 3 hours, 20 ASINs per call.
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
/** How far back the first fee-sample build looks (then each sync only adds newer sales). */
const DIAS_HISTORICO_TARIFAS = 90;
/**
 * Automatic syncs run every few minutes: orders every time, everything else (finances, stock, listings,
 * reports, Gmail…) at most this often. A sync started by hand is always complete.
 */
export const INTERVALO_COMPLETA_MS = 60 * 60_000;
/** Sync history kept (each sync leaves a doc; automatic ones would pile up). */
const HISTORIAL_DIAS = 14;

/** A lock older than this is considered abandoned (e.g. the server restarted mid-sync). */
export const BLOQUEO_MS = 15 * 60_000;

export type ResultadoSync = {
  /** false = quick sync (orders only); true = everything. */
  completa: boolean;
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

/**
 * `modo`: "completa" (the button) runs every stage; "auto" (the scheduled call) runs only the orders, plus
 * everything else when the last complete sync is older than INTERVALO_COMPLETA_MS.
 */
export async function sincronizar(modo: "completa" | "auto" = "completa"): Promise<ResultadoSync> {
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
    // Syncs saved before the quick/complete split count as complete.
    const ultimaCompleta = aFecha(ultima?.get("ultimaCompleta")) ?? aFecha(ultima?.get("fecha"));
    const completa = modo === "completa" || !ultimaCompleta || Date.now() - ultimaCompleta.getTime() >= INTERVALO_COMPLETA_MS;
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
    // Quick syncs trust the saved list (the markets hardly ever change).
    if (!completa && guardados.length > 0) sellersOk = true;
    else try {
      const vistos = new Set<string>();
      marketplaces = (await marketplacesActivos())
        // Amazon lists some marketplaces more than once (one entry per store): keep one per id.
        .filter((p) => !vistos.has(p.marketplace.id) && vistos.add(p.marketplace.id))
        .map((p) => ({
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
      // Telegram notice of the new sales (not on the very first sync, which brings months of history).
      if (cursorPedidos && r.lineasNuevas.length > 0) await avisarVentas(r.lineasNuevas).catch((e) => errores.push(`Telegram: ${mensaje(e)}`));
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

    // 3. Finances (complete syncs only: fees and refunds settle over days)
    if (completa) {
      try {
        const hasta = ahoraMenos3Min();
        let desde = cursorFinanzas ? new Date(cursorFinanzas.getTime() - SOLAPE_FINANZAS_MS) : primeraVez;
        if (hasta.getTime() - desde.getTime() > MAX_VENTANA_FINANZAS_MS) desde = new Date(hasta.getTime() - MAX_VENTANA_FINANZAS_MS);
        const eventos = await eventosFinancieros(desde, hasta);
        const resumidas: TransaccionResumida[] = resumirEventos(eventos, marketplacePorNombre);
        const esc = new Escritor();
        for (const t of resumidas) {
          // The 10-day overlap brings back mostly unchanged transactions: only new or changed ones are written.
          if (esc.set("transaccionesAmazon", t.transactionId, { ...t, sincronizadoEn: new Date() })) tocados.add(t.orderId);
        }
        escrituras += esc.cantidad;
        await esc.confirmar();
        transaccionesN = resumidas.length;
        cursorFinanzas = hasta;

        // Amazon's compensations (lost/damaged units, refunds never returned…) for the income side.
        try {
          if (await guardarCompensaciones(eventos.AdjustmentEventList)) escrituras++;
        } catch (e) {
          errores.push(`Compensaciones de Amazon: ${mensaje(e)}`);
        }

        // Real per-unit fees of the latest clean sale per SKU and country (product page payout box).
        try {
          const muestras = muestrasTarifas(eventos, marketplacePorNombre);
          if (!(await tarifasCreadas())) {
            // First time: look further back once, so countries with few sales also get a sample.
            const inicio = new Date(Math.max(hasta.getTime() - MAX_VENTANA_FINANZAS_MS, desde.getTime() - DIAS_HISTORICO_TARIFAS * 24 * 3600_000));
            if (inicio < desde) muestras.push(...muestrasTarifas(await eventosFinancieros(inicio, desde), marketplacePorNombre));
          }
          escrituras += await guardarTarifas(muestras);
        } catch (e) {
          errores.push(`Tarifas por venta: ${mensaje(e)}`);
        }

        // Amazon Global Logistics freight and import duties, billed per inbound shipment.
        try {
          const servicios = [...eventos.ServiceFeeEventList];
          const historico = !(await obtenerCostesEnvios()).historico;
          if (historico) {
            // First time: a year back, in windows of under 180 days (the API's limit), to cover older shipments.
            const DIA = 24 * 3600_000;
            const tramos: [Date, Date][] = [
              [new Date(hasta.getTime() - 365 * DIA), new Date(hasta.getTime() - 186 * DIA)],
              [new Date(hasta.getTime() - 186 * DIA), desde],
            ];
            for (const [a, b] of tramos) if (a < b) servicios.push(...(await eventosFinancieros(a, b)).ServiceFeeEventList);
          }
          escrituras += await guardarCargosEnvios(cargosDeEnvios(servicios), historico);
        } catch (e) {
          errores.push(`Costes de envíos: ${mensaje(e)}`);
        }
      } catch (e) {
        errores.push(`Finances API: ${mensaje(e)}`);
      }
    }

    // 4. Recompute fees, refunds and profit of every touched order
    try {
      const r = await recalcularPedidos([...tocados]);
      errores.push(...r.errores);
      escrituras += r.escrituras;
    } catch (e) {
      errores.push(`Recalcular beneficio: ${mensaje(e)}`);
    }

    // 5–11. Photos, stock, listings, reports, shipments, account health and Gmail (complete syncs only)
    if (completa) {
      // 5. Listing photos (a failure here never blocks the sales data)
      try {
        const r = await descargarImagenes(pedidosTraidos);
        errores.push(...r.errores);
        escrituras += r.escrituras;
      } catch (e) {
        errores.push(`Catalog Items API (fotos): ${mensaje(e)}`);
      }

      // 6. FBA stock (a failure here never blocks the sales data)
      try {
        await actualizarStock(marketplaces);
      } catch (e) {
        errores.push(`FBA Inventory API (stock): ${mensaje(e)}`);
      }

      // 7. Listing cards and prices (never blocks the sales data)
      try {
        const conVentas = new Set([...pedidosEnAlmacen().values()].map((p) => p.marketplaceId));
        escrituras += await actualizarFichas(marketplaces.filter((m) => conVentas.has(m.id)));
      } catch (e) {
        errores.push(`Catalog/Pricing API (fichas): ${mensaje(e)}`);
      }

      // Account-wide reports and lists are asked through one marketplace (amazon.es when there).
      const mkCuenta = marketplaces.find((m) => m.id === "A1RKKUPIHCS9HS")?.id ?? marketplaces[0]?.id;

      // 8. FBA customer returns report, at most every few hours (never blocks the sales data)
      try {
        if (mkCuenta) escrituras += await actualizarDevoluciones(mkCuenta);
      } catch (e) {
        errores.push(`Reports API (devoluciones): ${mensaje(e)}`);
      }

      // 8a. Stock per country (report, at most every few hours; never blocks the sales data)
      try {
        if (mkCuenta) escrituras += await actualizarInventarioPaises(mkCuenta);
      } catch (e) {
        errores.push(`Reports API (inventario por país): ${mensaje(e)}`);
      }

      // 8b. Inbound shipments to Amazon (never blocks the sales data)
      try {
        if (mkCuenta) escrituras += await actualizarEnvios(mkCuenta);
      } catch (e) {
        errores.push(`Fulfillment Inbound API (envíos): ${mensaje(e)}`);
      }

      // 9. Listing health: status and issues per SKU and country (never blocks the sales data)
      try {
        const conVentas = new Set([...pedidosEnAlmacen().values()].map((p) => p.marketplaceId));
        escrituras += await actualizarSaludListings(marketplaces.filter((m) => conVentas.has(m.id)).map((m) => m.id));
      } catch (e) {
        errores.push(`Listings API (estado del listing): ${mensaje(e)}`);
      }

      // 10. Account health per country (performance reports, at most every 12 h; never blocks the sales data)
      try {
        const conVentas = new Set([...pedidosEnAlmacen().values()].map((p) => p.marketplaceId));
        const r = await actualizarEstadoCuenta(marketplaces.filter((m) => conVentas.has(m.id)).map((m) => m.id));
        escrituras += r.escrituras;
        errores.push(...r.errores.map((e) => `Estado de la cuenta: ${e}`));
      } catch (e) {
        errores.push(`Estado de la cuenta: ${mensaje(e)}`);
      }

      // 10b. Account charges from new settlement reports (a couple every two weeks; never blocks the sales data)
      try {
        await actualizarGastos(3);
      } catch (e) {
        errores.push(`Gastos (liquidaciones): ${mensaje(e)}`);
      }

      // 10c. Payouts to the bank (one light call; the doc is only rewritten when a payout changed)
      try {
        await actualizarIngresos();
      } catch (e) {
        errores.push(`Ingresos (pagos de Amazon): ${mensaje(e)}`);
      }

      // 10d. «Saldo total» per marketplace, as Seller Central shows it (open period + money held back)
      try {
        const hace60 = Date.now() - 60 * 24 * 3600_000;
        await actualizarSaldos([...new Set([...pedidosEnAlmacen().values()].filter((p) => p.fecha.getTime() > hace60).map((p) => p.marketplaceId))]);
      } catch (e) {
        errores.push(`Saldo de Amazon: ${mensaje(e)}`);
      }

      // 11. Performance notifications from Gmail, when connected (never blocks the sales data)
      try {
        await sincronizarGmail();
      } catch (e) {
        errores.push(`Gmail (notificaciones): ${mensaje(e)}`);
      }
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
      completa,
      ultimaCompleta: completa ? Timestamp.now() : ultimaCompleta ? Timestamp.fromDate(ultimaCompleta) : null,
    });
    contarEscrituras(1);
    // Every write above is already in the mirror: the new version needs no re-read.
    fijarVersion(doc.id);
    recordarUltimaSync(doc.id);

    // Old sync records go (complete syncs only, in small batches).
    if (completa) {
      try {
        const viejos = await db
          .collection("sincronizaciones")
          .where("fecha", "<", Timestamp.fromMillis(Date.now() - HISTORIAL_DIAS * 24 * 3600_000))
          .limit(300)
          .get();
        contarLecturas(viejos.size);
        if (!viejos.empty) {
          const lote = db.batch();
          for (const d of viejos.docs) lote.delete(d.ref);
          await lote.commit();
          contarEscrituras(viejos.size);
        }
      } catch (e) {
        console.error("[sync] limpiar historial", e);
      }
    }

    return { completa, pedidosNuevos, pedidosActualizados: pedidosActualizadosN, transacciones: transaccionesN, escrituras, errores: errores.length ? errores : null, duracionMs };
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

/**
 * One-off import of older orders (by purchase date), month by month, saved like any sync but without sales
 * notices. Orders already stored are just refreshed. Takes the sync lock, so it never overlaps a sync.
 */
export async function importarHistorialPedidos(desde: Date, hasta: Date): Promise<{ pedidos: number; nuevos: number; escrituras: number; errores: string[] }> {
  const db = adminDb();
  const liberar = await tomarBloqueo(db);
  try {
    const ultima = (await db.collection("sincronizaciones").orderBy("fecha", "desc").limit(1).get()).docs[0];
    contarLecturas(1);
    await asegurarAlmacen(ultima?.id ?? null);
    const marketplaces = ((await db.collection("config").doc("marketplaces").get()).get("lista") as Marketplace[] | undefined) ?? [];
    contarLecturas(1);
    let pedidos = 0;
    let nuevos = 0;
    let escrituras = 0;
    const errores: string[] = [];
    for (let a = new Date(desde); a < hasta; ) {
      const b = new Date(Math.min(hasta.getTime(), a.getTime() + 31 * 24 * 3600_000));
      const lote = await pedidosActualizados(a, b, marketplaces.map((m) => m.id), true);
      const r = await guardarPedidos(lote, marketplaces);
      pedidos += lote.length;
      nuevos += r.nuevos;
      escrituras += r.escrituras;
      errores.push(...r.errores);
      a = b;
    }
    await volcarConsumo().catch(() => {});
    return { pedidos, nuevos, escrituras, errores };
  } finally {
    await liberar();
  }
}

/**
 * One-off import of older settlement events (real fees, refunds, VAT), month by month, then the orders they
 * touch are recomputed. Stored events are just overwritten, so running it twice is harmless. Takes the sync lock.
 */
export async function importarHistorialFinanzas(desde: Date, hasta: Date): Promise<{ transacciones: number; pedidos: number; escrituras: number; errores: string[] }> {
  const db = adminDb();
  const liberar = await tomarBloqueo(db);
  try {
    const ultima = (await db.collection("sincronizaciones").orderBy("fecha", "desc").limit(1).get()).docs[0];
    contarLecturas(1);
    await asegurarAlmacen(ultima?.id ?? null);
    let transacciones = 0;
    let escrituras = 0;
    const tocados = new Set<string>();
    for (let a = new Date(desde); a < hasta; ) {
      const b = new Date(Math.min(hasta.getTime(), a.getTime() + 31 * 24 * 3600_000));
      const esc = new Escritor();
      for (const t of resumirEventos(await eventosFinancieros(a, b), marketplacePorNombre)) {
        esc.set("transaccionesAmazon", t.transactionId, { ...t, sincronizadoEn: new Date() });
        // Every order with events is recomputed, not only changed ones: orders imported after their events
        // were stored never got their fees (only lines whose figures change are written).
        tocados.add(t.orderId);
        transacciones++;
      }
      escrituras += esc.cantidad;
      await esc.confirmar();
      a = b;
    }
    const r = await recalcularPedidos([...tocados]);
    await volcarConsumo().catch(() => {});
    return { transacciones, pedidos: tocados.size, escrituras: escrituras + r.escrituras, errores: r.errores };
  } finally {
    await liberar();
  }
}

async function guardarPedidos(pedidos: PedidoAmazon[], marketplaces: Marketplace[]) {
  const costes = await costesVigentes();
  const porId = new Map(marketplaces.map((m) => [m.id, m]));
  const existentes = pedidosEnAlmacen();
  const errores: string[] = [];
  const orderIds: string[] = [];
  // Lines of orders seen for the first time (for the sales notice).
  const lineasNuevas: Pedido[] = [];
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
      if (esNuevo) {
        nuevos++;
        lineasNuevas.push(...lineas);
      }
      // Unchanged orders don't need their fees recomputed either.
      if (cambiado) orderIds.push(p.orderId);
    } catch (e) {
      errores.push(`Pedido ${p.orderId}: ${mensaje(e)}`);
    }
  }
  const escrituras = esc.cantidad;
  await esc.confirmar();
  return { nuevos, orderIds, errores, escrituras, lineasNuevas };
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
