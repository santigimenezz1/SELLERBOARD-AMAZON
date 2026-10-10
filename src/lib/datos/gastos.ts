import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { cargosDeServicio, eventosFinancieros, filasLiquidacion, liquidacionesDisponibles, type ItemEvento } from "@/lib/amazon/apis";
import { eurPorUnidad } from "@/lib/amazon/tiposCambio";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * Amazon's account charges (not per-sale fees): storage, advertising,
 * subscription, Vine, coupons, EPR, removals… month by month and per region.
 *
 * - Dated lines come from the settlement reports (each payout, ~every 14 days
 *   per region), which Amazon keeps for 90 days: the sync saves each new one.
 * - Months before the first settlement we have come from the financial
 *   events, month by month (those fees carry no date of their own).
 * - Storage billed in a settlement period still open (its report only comes
 *   when it closes, ~2 weeks later) is read from that period's events and
 *   kept as a provisional line until the settlement line replaces it.
 *
 * One doc, `config/gastos`, kept in memory.
 */

export type CategoriaGasto =
  | "almacenamiento"
  | "publicidad"
  | "suscripcion"
  | "vine"
  | "cupones"
  | "rap"
  | "retiradas"
  | "envioEntrada"
  | "devoluciones"
  | "reclamaciones"
  | "clawback"
  | "agl"
  | "otros";
export type Region = "eu" | "uk";
/** importe: what it cost (positive), in its currency; eur: the same in euros (ECB rate of its day). */
/** pais: the marketplace it was charged in («DE», «GB»…), when known (settlements of the last 90 days and charges since). */
export type LineaGasto = { fecha: string | null; mes: string; categoria: CategoriaGasto; region: Region; concepto: string; importe: number; moneda: string; eur: number; pais?: string | null };
type Doc = {
  /** Dated lines from settlement reports, keyed by a stable id. */
  liquidadas: Record<string, LineaGasto>;
  /** Settlement report documents already read. */
  leidas: string[];
  /** Earliest settlement start seen (ISO date): months fully after it use the settlement lines. */
  cubiertoDesde: string | null;
  /** Month-level lines from financial events, for months the settlements don't cover. */
  historico: LineaGasto[];
  /** Storage charged in settlement periods not closed yet, dated the day the sync first saw it. */
  pendientes: Record<string, LineaGasto>;
  actualizadoEn: string | null;
};

/** Bumped when the way lines are read changes: the doc is then rebuilt from the reports. */
const VERSION = 3;
const g = globalThis as unknown as { __gastosV3?: Doc };
const ref = () => adminDb().collection("config").doc("gastos");

async function leer(): Promise<Doc> {
  if (g.__gastosV3) return g.__gastosV3;
  const snap = await ref().get();
  contarLecturas(1);
  // Saved by older code: start over.
  if (snap.get("version") !== VERSION) {
    g.__gastosV3 = { liquidadas: {}, leidas: [], cubiertoDesde: null, historico: [], pendientes: {}, actualizadoEn: null };
    return g.__gastosV3;
  }
  g.__gastosV3 = {
    liquidadas: (snap.get("liquidadas") as Doc["liquidadas"] | undefined) ?? {},
    leidas: (snap.get("leidas") as string[] | undefined) ?? [],
    cubiertoDesde: (snap.get("cubiertoDesde") as string | undefined) ?? null,
    historico: (snap.get("historico") as LineaGasto[] | undefined) ?? [],
    pendientes: (snap.get("pendientes") as Doc["pendientes"] | undefined) ?? {},
    actualizadoEn: (snap.get("actualizadoEn") as string | undefined) ?? null,
  };
  return g.__gastosV3;
}

async function guardar(doc: Doc) {
  doc.actualizadoEn = new Date().toISOString();
  await ref().set({ ...doc, version: VERSION });
  contarEscrituras(1);
  g.__gastosV3 = doc;
}

/** Category of a charge by its wording (settlement description or financial fee type). */
function categoria(texto: string): CategoriaGasto {
  if (/^refund$/i.test(texto)) return "devoluciones";
  if (/^(guaranteeclaim|chargeback)$/i.test(texto)) return "reclamaciones";
  if (/clawback/i.test(texto)) return "clawback";
  if (/storage/i.test(texto)) return "almacenamiento";
  if (/advertising|ProductAds/i.test(texto)) return "publicidad";
  if (/subscription/i.test(texto)) return "suscripcion";
  if (/vine/i.test(texto)) return "vine";
  if (/coupon/i.test(texto)) return "cupones";
  if (/EPR/i.test(texto)) return "rap";
  if (/removal|disposal/i.test(texto)) return "retiradas";
  if (/international.*freight|InternationalInbound|GlobalInbound/i.test(texto)) return "agl";
  if (/inbound/i.test(texto)) return "envioEntrada";
  return "otros";
}

// Settlement lines that aren't charges: sales (their fees are already netted in each payout), payouts,
// reserves, card top-ups, debt moves between accounts, and Amazon's reimbursements (income, handled apart).
const NO_ES_GASTO = /reserve|payable to amazon|successful charge|transfer of funds|debt adjustment|reimbursement|^Order$/i;

/**
 * Per-order money taken back: a refund (the sale's money back to the customer, less the part of the fees
 * Amazon returns, plus its refund administration fee), an A-to-z claim or a chargeback. All lines of the
 * transaction are netted: what's left is what it cost.
 */
function categoriaDeTransaccion(tipo: string, desc: string): CategoriaGasto | null {
  if (/^refund$/i.test(tipo)) return "devoluciones";
  if (/chargeback|guarantee|a-to-z/i.test(tipo)) return "reclamaciones";
  // Amazon taking back a reimbursement it had paid (lost/damaged unit found later).
  if (/clawback/i.test(desc)) return "clawback";
  return null;
}

/** "07.09.2026" → "2026-09-07" (settlement dates); ISO dates pass through. */
function fechaIso(t: string): string | null {
  const m = t.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
}

/** "-289,06" / "1.234,56" (EUR reports) or "-95.16" (GBP) → number. */
function numero(t: string): number {
  const s = (t ?? "").trim();
  if (/,\d{1,2}$/.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
  return Number(s.replace(/,/g, ""));
}

/** Marketplaces of the account: the ones whose charges are read, by their Amazon id and domain. */
const MERCADOS: { pais: string; id: string; dominio: string }[] = [
  { pais: "ES", id: "A1RKKUPIHCS9HS", dominio: "amazon.es" },
  { pais: "DE", id: "A1PA6795UKMFR9", dominio: "amazon.de" },
  { pais: "FR", id: "A13V1IB3VIYZZH", dominio: "amazon.fr" },
  { pais: "IT", id: "APJ6JRA9NG5V4", dominio: "amazon.it" },
  { pais: "GB", id: "A1F83G8C2ARO7P", dominio: "amazon.co.uk" },
  { pais: "NL", id: "A1805IZSGTT6HS", dominio: "amazon.nl" },
  { pais: "BE", id: "AMEN7PMS3EDWL", dominio: "amazon.com.be" },
  { pais: "SE", id: "A2NODRKZP88ZB9", dominio: "amazon.se" },
  { pais: "PL", id: "A1C3SOZRARQ6R3", dominio: "amazon.pl" },
];

/** A settlement's marketplace: the one most of its rows name («Amazon.de»); null when none does. */
function paisDeLiquidacion(filas: Record<string, string>[]): string | null {
  const cuenta = new Map<string, number>();
  for (const f of filas) {
    const m = MERCADOS.find((x) => (f["marketplace-name"] ?? "").toLowerCase() === x.dominio);
    if (m) cuenta.set(m.pais, (cuenta.get(m.pais) ?? 0) + 1);
  }
  return [...cuenta].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Charges in one settlement report, one line per concept and date (base fee + tax + discounts together). */
async function gastosDeLiquidacion(documentId: string): Promise<{ lineas: Record<string, LineaGasto>; inicio: string | null }> {
  const filas = await filasLiquidacion(documentId);
  const cab = filas[0];
  const sid = cab?.["settlement-id"] ?? documentId;
  const moneda = cab?.["currency"] || "EUR";
  const inicio = fechaIso(cab?.["settlement-start-date"] ?? "");
  const pais = paisDeLiquidacion(filas);
  const lineas: Record<string, LineaGasto> = {};
  for (const f of filas) {
    const tipo = f["transaction-type"] ?? "";
    const clase = f["amount-type"] ?? "";
    // The charge's name is in amount-type for fee lines ("FBA Inventory Storage Fee" + "Base fee" / "Tax on
    // fee" / "Discount on Fee"), and in amount-description for the rest ("Subscription Fee").
    const desc = /^(base fee|tax on fee|discount on fee|transactiontotalamount)$/i.test(f["amount-description"] ?? "") ? clase : (f["amount-description"] ?? "");
    const porTransaccion = categoriaDeTransaccion(tipo, desc);
    if (!tipo || (!porTransaccion && (NO_ES_GASTO.test(tipo) || NO_ES_GASTO.test(clase) || NO_ES_GASTO.test(desc)))) continue;
    const importe = -numero(f["amount"]);
    const fecha = fechaIso(f["posted-date"] ?? f["posted-date-time"] ?? "");
    if (!Number.isFinite(importe) || importe === 0 || !fecha) continue;
    // Refunds and claims: one line per day, all their parts netted.
    const concepto = porTransaccion ?? desc;
    const id = `${sid}|${fecha}|${concepto}`;
    const l = (lineas[id] ??= { fecha, mes: fecha.slice(0, 7), categoria: porTransaccion ?? categoria(desc), region: moneda === "GBP" ? "uk" : "eu", concepto, importe: 0, moneda, eur: 0, pais });
    l.importe = Math.round((l.importe + importe) * 100) / 100;
  }
  // A day whose refunds came back positive (Amazon returned more than it took) isn't a cost.
  for (const [id, l] of Object.entries(lineas)) if (l.importe <= 0 && l.categoria !== "otros") delete lineas[id];
  for (const l of Object.values(lineas)) l.eur = Math.round(l.importe * (l.moneda === "EUR" ? 1 : await eurPorUnidad(l.moneda, new Date(l.fecha!))) * 100) / 100;
  return { lineas, inicio };
}

/**
 * Sync stage: reads the settlement reports not seen yet (at most `max` per call; Amazon throttles report
 * downloads). What was read is saved even if a later one fails, so the next call carries on. Returns how many
 * are still pending.
 */
export async function actualizarGastos(max = 5): Promise<number> {
  const doc = await leer();
  const nuevas = (await liquidacionesDisponibles()).filter((l) => !doc.leidas.includes(l.reportDocumentId));
  if (nuevas.length === 0) return 0;
  const liquidadas = { ...doc.liquidadas };
  let cubiertoDesde = doc.cubiertoDesde;
  const leidas = [...doc.leidas];
  let hechas = 0;
  try {
    for (const l of nuevas.slice(0, max)) {
      const r = await gastosDeLiquidacion(l.reportDocumentId);
      Object.assign(liquidadas, r.lineas);
      if (r.inicio && (!cubiertoDesde || r.inicio < cubiertoDesde)) cubiertoDesde = r.inicio;
      leidas.push(l.reportDocumentId);
      hechas++;
    }
  } finally {
    if (hechas > 0) await guardar({ ...doc, liquidadas, leidas, cubiertoDesde });
  }
  return nuevas.length - hechas;
}

/** Provisional lines a settlement already brought (same kind and amount, posted around then) or too old to wait for. */
function pendientesVigentes(doc: Doc): Record<string, LineaGasto> {
  const usadas = new Set<string>();
  const limite = new Date(Date.now() - 60 * 24 * 3600_000).toISOString().slice(0, 10);
  const res: Record<string, LineaGasto> = {};
  for (const [id, p] of Object.entries(doc.pendientes)) {
    if (!p.fecha || p.fecha < limite) continue;
    const desde = new Date(new Date(p.fecha).getTime() - 7 * 24 * 3600_000).toISOString().slice(0, 10);
    const liquidada = Object.entries(doc.liquidadas).find(
      ([k, l]) => !usadas.has(k) && l.categoria === p.categoria && l.moneda === p.moneda && !!l.fecha && l.fecha >= desde && Math.abs(l.importe - p.importe) <= Math.max(0.05, p.importe * 0.01),
    );
    if (liquidada) usadas.add(liquidada[0]);
    else res[id] = p;
  }
  return res;
}

/**
 * Sync stage: storage charged in the settlement periods still open. Amazon bills it on the 5th–7th of each month, in
 * every marketplace, but its settlement report only comes when the period closes; until then it's a provisional line
 * (with its country and exact day), so the month shows the real charge instead of an estimate. Asked only in the
 * first half of the month, when storage is billed.
 */
export async function actualizarAlmacenajePendiente(forzar = false): Promise<void> {
  const ahora = new Date();
  if (!forzar && ahora.getUTCDate() > 15) return;
  const doc = await leer();
  const pendientes = pendientesVigentes(doc);
  const desde = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1) - 2 * 24 * 3600_000);
  for (const m of MERCADOS) {
    for (const c of await cargosDeServicio(m.id, desde)) {
      const importe = Math.round(-c.importe * 100) / 100;
      if (categoria(c.descripcion) !== "almacenamiento" || importe <= 0 || pendientes[c.id]) continue;
      const fecha = c.fecha.slice(0, 10);
      const eur = Math.round(importe * (c.moneda === "EUR" ? 1 : await eurPorUnidad(c.moneda, new Date(c.fecha))) * 100) / 100;
      pendientes[c.id] = { fecha, mes: fecha.slice(0, 7), categoria: "almacenamiento", region: c.moneda === "GBP" ? "uk" : "eu", concepto: "FBA Inventory Storage Fee (pendiente de liquidar)", importe, moneda: c.moneda, eur, pais: m.pais };
    }
    await new Promise((ok) => setTimeout(ok, 1100));
  }
  // Lines of the old reading (by settlement period, without country) give way to these.
  for (const [id, p] of Object.entries(pendientes)) if (!p.pais) delete pendientes[id];
  if (JSON.stringify(pendientes) !== JSON.stringify(doc.pendientes)) await guardar({ ...doc, pendientes });
}

/**
 * One-off: puts the country on the settlement lines saved before it was read (from the reports Amazon still keeps,
 * 90 days). Returns how many lines got it.
 */
export async function completarPaisesGastos(): Promise<number> {
  const doc = await leer();
  const liquidadas = { ...doc.liquidadas };
  let n = 0;
  for (const l of await liquidacionesDisponibles()) {
    // Amazon throttles report downloads: wait and try again.
    let filas: Awaited<ReturnType<typeof filasLiquidacion>> = [];
    for (let intento = 0; ; intento++) {
      try {
        filas = await filasLiquidacion(l.reportDocumentId);
        break;
      } catch (e) {
        if (intento >= 6 || !/429|Quota/i.test(String(e))) throw e;
        await new Promise((ok) => setTimeout(ok, 30_000 * (intento + 1)));
      }
    }
    const sid = filas[0]?.["settlement-id"] ?? l.reportDocumentId;
    const pais = paisDeLiquidacion(filas);
    if (!pais) continue;
    for (const [id, linea] of Object.entries(liquidadas))
      if (id.startsWith(`${sid}|`) && !linea.pais) {
        liquidadas[id] = { ...linea, pais };
        n++;
      }
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  if (n) await guardar({ ...doc, liquidadas });
  return n;
}

/**
 * One-off: month-level charges from the financial events for the months before the first settlement we have
 * (their fees carry no date, so each month is asked on its own).
 */
export async function importarHistoricoGastos(desdeMes: string): Promise<number> {
  const doc = await leer();
  const hastaMes = mesCompleto(doc.cubiertoDesde);
  const historico: LineaGasto[] = [];
  for (let mes = desdeMes; hastaMes && mes < hastaMes; mes = siguienteMes(mes)) {
    const inicio = new Date(`${mes}-01T00:00:00+01:00`);
    const fin = new Date(`${siguienteMes(mes)}-01T00:00:00+01:00`);
    const ev = await eventosFinancieros(inicio, fin);
    const suma = new Map<string, LineaGasto>();
    const anadir = async (concepto: string, importe: number, moneda: string) => {
      if (!importe) return;
      const cat = categoria(concepto);
      const region: Region = moneda === "GBP" ? "uk" : "eu";
      const k = `${cat}|${region}|${moneda}`;
      const l = suma.get(k) ?? { fecha: null, mes, categoria: cat, region, concepto: cat, importe: 0, moneda, eur: 0 };
      l.importe += importe;
      suma.set(k, l);
    };
    for (const e of ev.ServiceFeeEventList) for (const f of e.FeeList ?? []) await anadir(f.FeeType ?? "", -(Number(f.FeeAmount?.CurrencyAmount) || 0), f.FeeAmount?.CurrencyCode ?? "EUR");
    for (const e of ev.ProductAdsPaymentEventList) await anadir("ProductAds", -(Number(e.transactionValue?.CurrencyAmount) || 0), e.transactionValue?.CurrencyCode ?? "EUR");
    // Refunds, A-to-z claims and chargebacks: every part of each item netted (money back, fees returned,
    // refund fee, withheld VAT given back).
    const netoItem = (it: ItemEvento) =>
      [it.ItemChargeAdjustmentList, it.ItemFeeAdjustmentList, it.PromotionAdjustmentList, ...(it.ItemTaxWithheldList ?? []).map((w) => w.TaxesWithheld)]
        .flatMap((l) => l ?? [])
        .map((c) => ({ v: Number((c.ChargeAmount ?? c.FeeAmount ?? c.PromotionAmount)?.CurrencyAmount) || 0, m: (c.ChargeAmount ?? c.FeeAmount ?? c.PromotionAmount)?.CurrencyCode ?? "EUR" }));
    for (const [lista, cat] of [
      [ev.RefundEventList, "Refund"],
      [ev.GuaranteeClaimEventList, "GuaranteeClaim"],
      [ev.ChargebackEventList, "Chargeback"],
    ] as const)
      for (const e of lista) for (const it of e.ShipmentItemAdjustmentList ?? []) for (const x of netoItem(it)) await anadir(cat, -x.v, x.m);
    for (const e of ev.AdjustmentEventList) if (/clawback/i.test(e.AdjustmentType ?? "")) await anadir("Clawback", -(Number(e.AdjustmentAmount?.CurrencyAmount) || 0), e.AdjustmentAmount?.CurrencyCode ?? "EUR");
    for (const l of suma.values()) {
      l.importe = Math.round(l.importe * 100) / 100;
      l.eur = Math.round(l.importe * (l.moneda === "EUR" ? 1 : await eurPorUnidad(l.moneda, new Date(`${mes}-15T12:00:00Z`))) * 100) / 100;
      historico.push(l);
    }
  }
  await guardar({ ...doc, historico });
  return historico.length;
}

const siguienteMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
};
/** First month fully covered by settlements (the one after the earliest settlement start, unless it starts on the 1st). */
function mesCompleto(desde: string | null): string | null {
  if (!desde) return null;
  return desde.slice(8, 10) === "01" ? desde.slice(0, 7) : siguienteMes(desde.slice(0, 7));
}

const mesAnterior = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};

/**
 * The month a charge belongs to (accrual), which may differ from the month it was charged: storage is charged
 * early in the month for the month before, and the advertising invoice of the 1st–3rd is the previous month's.
 */
function mesDevengo(l: LineaGasto): string {
  const cobrado = l.fecha?.slice(0, 7) ?? l.mes;
  if (l.categoria === "almacenamiento") return mesAnterior(cobrado);
  if (l.categoria === "publicidad" && l.fecha && Number(l.fecha.slice(8, 10)) <= 3) return mesAnterior(cobrado);
  return cobrado;
}

/**
 * All charges: the settlement lines from the first fully covered month on, the month-level history before it.
 * `mes` is the month each charge belongs to; `mesCobro` the one Amazon charged it in.
 */
export async function obtenerGastos() {
  const doc = await leer();
  const corte = mesCompleto(doc.cubiertoDesde);
  const lineas = [...doc.historico.filter((l) => !corte || l.mes < corte), ...Object.values(doc.liquidadas).filter((l) => !corte || l.mes >= corte), ...Object.values(pendientesVigentes(doc))].map((l) => ({
    ...l,
    mesCobro: l.fecha?.slice(0, 7) ?? l.mes,
    mes: mesDevengo(l),
  }));
  return { lineas: lineas.sort((a, b) => (a.fecha ?? a.mes).localeCompare(b.fecha ?? b.mes)), actualizadoEn: doc.actualizadoEn, fechasDesde: corte };
}
export type DatosGastos = Awaited<ReturnType<typeof obtenerGastos>>;
