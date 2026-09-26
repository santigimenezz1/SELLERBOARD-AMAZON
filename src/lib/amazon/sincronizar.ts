import "server-only";

import { FieldValue, Timestamp, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { calcularBeneficio, redondear, type Marketplace, type Pedido } from "@/lib/datos/tipos";
import { nombrePais } from "@/lib/datos/paises";
import { ivaIncluido } from "@/lib/datos/iva";
import { marketplacesActivos, pedidosActualizados, transacciones, type PedidoAmazon } from "./apis";
import { resumirTransaccion, type TransaccionResumida } from "./finanzas";
import { ahoraMenos3Min } from "./cliente";
import { eurPorUnidad } from "./tiposCambio";

/*
 * Sync with Amazon, incremental on two independent cursors:
 *
 * 1. Sellers API  → active marketplaces (stored in config/marketplaces).
 * 2. Orders API   → orders UPDATED since the last sync (not just created: a
 *                   pending order gets its price, a cancellation flips its
 *                   status…). Upserted as one `pedidos` doc per order line.
 * 3. Finances API → transactions POSTED since the last sync (sale charges with
 *                   their fees, refunds…), stored raw-ish in
 *                   `transaccionesAmazon`. Pulling the event stream instead of
 *                   asking per order also catches refunds of old orders.
 * 4. Every order touched in 2 or 3 gets comisiones/reembolso/beneficio
 *    recomputed from ALL its stored transactions, so re-running is idempotent.
 *
 * Each cursor only advances when its stage completes; a failed stage is simply
 * retried from the same point next time.
 */

/** Finances re-reads this far back every sync: deferred transactions can change status after posting. */
const SOLAPE_FINANZAS_MS = 10 * 24 * 3600_000;
const SOLAPE_PEDIDOS_MS = 5 * 60_000;
const MAX_VENTANA_FINANZAS_MS = 179 * 24 * 3600_000;
const BLOQUEO_MS = 15 * 60_000;

export type ResultadoSync = {
  pedidosNuevos: number;
  pedidosActualizados: number;
  transacciones: number;
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

async function escribirEnLotes(db: Firestore, ops: { ref: FirebaseFirestore.DocumentReference; data: DocumentData }[]) {
  for (const grupo of trocear(ops, 400)) {
    const batch = db.batch();
    for (const { ref, data } of grupo) batch.set(ref, data, { merge: true });
    await batch.commit();
  }
}

async function tomarBloqueo(db: Firestore) {
  const ref = db.collection("config").doc("sync");
  await db.runTransaction(async (tx) => {
    const desde = aFecha((await tx.get(ref)).get("enCursoDesde"));
    if (desde && Date.now() - desde.getTime() < BLOQUEO_MS) {
      throw new SyncEnCurso("Ya hay una sincronización en curso. Espera a que termine.");
    }
    tx.set(ref, { enCursoDesde: Timestamp.now() }, { merge: true });
  });
  return () => ref.set({ enCursoDesde: FieldValue.delete() }, { merge: true });
}

export async function sincronizar(): Promise<ResultadoSync> {
  const db = adminDb();
  const inicio = Date.now();
  const liberar = await tomarBloqueo(db);
  const errores: string[] = [];
  let pedidosNuevos = 0;
  let pedidosActualizadosN = 0;
  let transaccionesN = 0;

  try {
    const ultima = (await db.collection("sincronizaciones").orderBy("fecha", "desc").limit(1).get()).docs[0];
    let cursorPedidos = aFecha(ultima?.get("cursorPedidos"));
    let cursorFinanzas = aFecha(ultima?.get("cursorFinanzas"));
    const primeraVez = new Date(Date.now() - diasIniciales() * 24 * 3600_000);
    const tocados = new Set<string>();

    // 1. Marketplaces
    let marketplaces: Marketplace[] = [];
    try {
      marketplaces = (await marketplacesActivos()).map((p) => ({
        id: p.marketplace.id,
        codigoPais: p.marketplace.countryCode,
        pais: nombrePais(p.marketplace.countryCode),
        dominio: p.marketplace.domainName ?? "",
        moneda: p.marketplace.defaultCurrencyCode,
      }));
      await db.collection("config").doc("marketplaces").set({ lista: marketplaces, actualizadoEn: Timestamp.now() });
    } catch (e) {
      errores.push(`Sellers API: ${mensaje(e)}`);
      marketplaces = ((await db.collection("config").doc("marketplaces").get()).get("lista") as Marketplace[] | undefined) ?? [];
    }

    // 2. Orders
    if (marketplaces.length === 0) {
      errores.push("No hay marketplaces activos conocidos: no se pueden pedir pedidos.");
    } else {
      try {
        const hasta = ahoraMenos3Min();
        const desde = cursorPedidos ? new Date(cursorPedidos.getTime() - SOLAPE_PEDIDOS_MS) : primeraVez;
        const pedidos = await pedidosActualizados(desde, hasta, marketplaces.map((m) => m.id));
        const r = await guardarPedidos(db, pedidos, marketplaces);
        pedidosNuevos = r.nuevos;
        pedidosActualizadosN = pedidos.length;
        r.orderIds.forEach((id) => tocados.add(id));
        errores.push(...r.errores);
        // A failed order (e.g. no exchange rate) must be fetched again next time: keep the cursor.
        if (r.errores.length === 0) cursorPedidos = hasta;
      } catch (e) {
        errores.push(`Orders API: ${mensaje(e)}`);
      }
    }

    // 3. Finances
    try {
      const hasta = ahoraMenos3Min();
      let desde = cursorFinanzas ? new Date(cursorFinanzas.getTime() - SOLAPE_FINANZAS_MS) : primeraVez;
      if (hasta.getTime() - desde.getTime() > MAX_VENTANA_FINANZAS_MS) desde = new Date(hasta.getTime() - MAX_VENTANA_FINANZAS_MS);
      const resumidas = (await transacciones(desde, hasta)).map(resumirTransaccion).filter((t): t is TransaccionResumida => t !== null);
      await escribirEnLotes(
        db,
        resumidas.map((t) => ({
          ref: db.collection("transaccionesAmazon").doc(t.transactionId),
          data: { ...t, fechaPublicacion: Timestamp.fromDate(t.fechaPublicacion), sincronizadoEn: Timestamp.now() },
        })),
      );
      transaccionesN = resumidas.length;
      resumidas.forEach((t) => tocados.add(t.orderId));
      cursorFinanzas = hasta;
    } catch (e) {
      errores.push(`Finances API: ${mensaje(e)}`);
    }

    // 4. Recompute fees, refunds and profit of every touched order
    try {
      errores.push(...(await recalcularPedidos(db, [...tocados])));
    } catch (e) {
      errores.push(`Recalcular beneficio: ${mensaje(e)}`);
    }

    const duracionMs = Date.now() - inicio;
    await db.collection("sincronizaciones").add({
      fecha: Timestamp.now(),
      pedidosNuevos,
      errores: errores.length ? errores : null,
      cursorPedidos: cursorPedidos ? Timestamp.fromDate(cursorPedidos) : null,
      cursorFinanzas: cursorFinanzas ? Timestamp.fromDate(cursorFinanzas) : null,
      pedidosActualizados: pedidosActualizadosN,
      transacciones: transaccionesN,
      duracionMs,
    });

    return { pedidosNuevos, pedidosActualizados: pedidosActualizadosN, transacciones: transaccionesN, errores: errores.length ? errores : null, duracionMs };
  } finally {
    await liberar();
  }
}

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function costesVigentes(db: Firestore): Promise<Map<string, number>> {
  const snap = await db.collection("costesProducto").get();
  return new Map(snap.docs.map((d) => [d.get("sku") as string, d.get("costeUnitario") as number]));
}

async function guardarPedidos(db: Firestore, pedidos: PedidoAmazon[], marketplaces: Marketplace[]) {
  const costes = await costesVigentes(db);
  const porId = new Map(marketplaces.map((m) => [m.id, m]));
  const errores: string[] = [];
  const orderIds: string[] = [];
  let nuevos = 0;

  for (const lote of trocear(pedidos, 100)) {
    const refs = lote.flatMap((p) => p.orderItems.map((i) => db.collection("pedidos").doc(`${p.orderId}_${i.orderItemId}`)));
    const existentes = new Map((refs.length ? await db.getAll(...refs) : []).filter((s) => s.exists).map((s) => [s.id, s]));
    const ops: { ref: FirebaseFirestore.DocumentReference; data: DocumentData }[] = [];

    for (const p of lote) {
      const fecha = new Date(p.createdTime);
      const marketplaceId = p.salesChannel.marketplaceId ?? "";
      const mk = porId.get(marketplaceId);
      let esNuevo = true;
      try {
        const lineas: DocumentData[] = [];
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
          const costeGuardado = (previo?.get("costeProducto") as number | null | undefined) ?? null;
          const costeUnitario = costes.get(sku);
          const costeProducto = costeGuardado ?? (costeUnitario !== undefined ? redondear(costeUnitario * item.quantityOrdered) : null);
          const comisionesAmazon = (previo?.get("comisionesAmazon") as number | undefined) ?? 0;
          const reembolso = (previo?.get("reembolso") as number | undefined) ?? 0;
          const impuestosReembolso = (previo?.get("impuestosReembolso") as number | undefined) ?? 0;
          const ventaTotal = redondear(ventaOriginal * tipoCambio);
          // VAT: as reported by the Orders API if it breaks it out, otherwise estimated from the country's
          // standard rate. Once Amazon settles the sale, recalcularPedidos replaces it with the settled VAT.
          const ivaInformado = desgloseIva.length > 0 ? desgloseIva.reduce((s, b) => s + Number(b.subtotal.amount), 0) : null;
          const ivaCalculado = ivaInformado ?? ivaIncluido(ventaOriginal, mk?.codigoPais);
          const impuestos = redondear((ivaCalculado ?? 0) * tipoCambio);
          const ivaEstimado = ivaInformado === null;

          lineas.push({
            id,
            amazonOrderId: p.orderId,
            orderItemId: item.orderItemId,
            fecha: Timestamp.fromDate(fecha),
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
            liquidado: (previo?.get("liquidado") as boolean | undefined) ?? false,
            moneda,
            tipoCambio,
            sincronizadoEn: Timestamp.now(),
          });
        }
        for (const l of lineas) ops.push({ ref: db.collection("pedidos").doc(l.id as string), data: l });
        if (esNuevo) nuevos++;
        orderIds.push(p.orderId);
      } catch (e) {
        errores.push(`Pedido ${p.orderId}: ${mensaje(e)}`);
      }
    }
    await escribirEnLotes(db, ops);
  }
  return { nuevos, orderIds, errores };
}

type LineaDoc = { ref: FirebaseFirestore.DocumentReference; data: Pedido };

/**
 * Rebuilds comisiones/reembolso/IVA/liquidado/beneficio of these orders from all their stored transactions.
 * VAT from the settled sale replaces the Orders API / estimated one; refunds that don't break out their
 * VAT are assumed to carry the same VAT share as the sale.
 */
export async function recalcularPedidos(db: Firestore, orderIds: string[]): Promise<string[]> {
  const errores: string[] = [];
  for (const grupo of trocear(orderIds, 30)) {
    const [lineasSnap, txSnap] = await Promise.all([
      db.collection("pedidos").where("amazonOrderId", "in", grupo).get(),
      db.collection("transaccionesAmazon").where("orderId", "in", grupo).get(),
    ]);
    const lineasPorPedido = new Map<string, LineaDoc[]>();
    for (const d of lineasSnap.docs) {
      const data = d.data() as Pedido;
      lineasPorPedido.set(data.amazonOrderId, [...(lineasPorPedido.get(data.amazonOrderId) ?? []), { ref: d.ref, data }]);
    }
    const txPorPedido = new Map<string, (TransaccionResumida & { fechaPublicacion: Timestamp })[]>();
    for (const d of txSnap.docs) {
      const t = d.data() as TransaccionResumida & { fechaPublicacion: Timestamp };
      txPorPedido.set(t.orderId, [...(txPorPedido.get(t.orderId) ?? []), t]);
    }

    const ops: { ref: FirebaseFirestore.DocumentReference; data: DocumentData }[] = [];
    for (const [orderId, lineas] of lineasPorPedido) {
      try {
        type Acumulado = { comisiones: number; reembolso: number; ivaVenta: number | null; ivaReembolso: number; reembolsoSinIva: number };
        const acumulado = new Map<string, Acumulado>(lineas.map((l) => [l.ref.id, { comisiones: 0, reembolso: 0, ivaVenta: null, ivaReembolso: 0, reembolsoSinIva: 0 }]));
        const txs = txPorPedido.get(orderId) ?? [];
        for (const t of txs) {
          for (const tl of t.lineas) {
            const destino = tl.sku ? lineas.filter((l) => l.data.sku === tl.sku) : [];
            const reparto = destino.length ? destino : lineas; // no SKU / unknown SKU → whole order
            const pesoTotal = reparto.reduce((s, l) => s + Math.max(l.data.ventaTotal, 0), 0);
            for (const l of reparto) {
              const peso = pesoTotal > 0 ? Math.max(l.data.ventaTotal, 0) / pesoTotal : 1 / reparto.length;
              const cambio = t.moneda === l.data.moneda ? l.data.tipoCambio : await eurPorUnidad(t.moneda, t.fechaPublicacion.toDate());
              const a = acumulado.get(l.ref.id)!;
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
        for (const l of lineas) {
          const a = acumulado.get(l.ref.id)!;
          const comisionesAmazon = redondear(a.comisiones);
          const reembolso = redondear(a.reembolso);
          const d = l.data;
          const impuestos = a.ivaVenta !== null ? redondear(a.ivaVenta) : (d.impuestos ?? 0);
          const ivaEstimado = a.ivaVenta !== null ? false : (d.ivaEstimado ?? true);
          const cuotaIva = d.ventaTotal > 0 ? impuestos / d.ventaTotal : 0;
          const impuestosReembolso = redondear(a.ivaReembolso + a.reembolsoSinIva * cuotaIva);
          const beneficioNeto = calcularBeneficio({ ventaTotal: d.ventaTotal, impuestos, comisionesAmazon, reembolso, impuestosReembolso, costeProducto: d.costeProducto });
          const nuevo = { comisionesAmazon, reembolso, impuestos, ivaEstimado, impuestosReembolso, liquidado, beneficioNeto };
          if ((Object.keys(nuevo) as (keyof typeof nuevo)[]).some((k) => d[k] !== nuevo[k])) ops.push({ ref: l.ref, data: nuevo });
        }
      } catch (e) {
        errores.push(`Pedido ${orderId}: ${mensaje(e)}`);
      }
    }
    await escribirEnLotes(db, ops);
  }
  return errores;
}

/** Fills the cost of lines that were saved before this SKU had one (lines that already have a cost are never touched). */
export async function aplicarCosteAPedidosSinCoste(db: Firestore, sku: string, costeUnitario: number): Promise<number> {
  const snap = await db.collection("pedidos").where("sku", "==", sku).where("costeProducto", "==", null).get();
  await escribirEnLotes(
    db,
    snap.docs.map((d) => {
      const p = d.data() as Pedido;
      const costeProducto = redondear(costeUnitario * p.unidades);
      return { ref: d.ref, data: { costeProducto, beneficioNeto: calcularBeneficio({ ...p, impuestosReembolso: p.impuestosReembolso ?? 0, costeProducto }) } };
    }),
  );
  return snap.size;
}

