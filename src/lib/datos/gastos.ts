import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { eventosFinancieros, filasLiquidacion, liquidacionesDisponibles, type ItemEvento } from "@/lib/amazon/apis";
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
export type LineaGasto = { fecha: string | null; mes: string; categoria: CategoriaGasto; region: Region; concepto: string; importe: number; moneda: string; eur: number };
type Doc = {
  /** Dated lines from settlement reports, keyed by a stable id. */
  liquidadas: Record<string, LineaGasto>;
  /** Settlement report documents already read. */
  leidas: string[];
  /** Earliest settlement start seen (ISO date): months fully after it use the settlement lines. */
  cubiertoDesde: string | null;
  /** Month-level lines from financial events, for months the settlements don't cover. */
  historico: LineaGasto[];
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
    g.__gastosV3 = { liquidadas: {}, leidas: [], cubiertoDesde: null, historico: [], actualizadoEn: null };
    return g.__gastosV3;
  }
  g.__gastosV3 = {
    liquidadas: (snap.get("liquidadas") as Doc["liquidadas"] | undefined) ?? {},
    leidas: (snap.get("leidas") as string[] | undefined) ?? [],
    cubiertoDesde: (snap.get("cubiertoDesde") as string | undefined) ?? null,
    historico: (snap.get("historico") as LineaGasto[] | undefined) ?? [],
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

/** Charges in one settlement report, one line per concept and date (base fee + tax + discounts together). */
async function gastosDeLiquidacion(documentId: string): Promise<{ lineas: Record<string, LineaGasto>; inicio: string | null }> {
  const filas = await filasLiquidacion(documentId);
  const cab = filas[0];
  const sid = cab?.["settlement-id"] ?? documentId;
  const moneda = cab?.["currency"] || "EUR";
  const inicio = fechaIso(cab?.["settlement-start-date"] ?? "");
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
    const l = (lineas[id] ??= { fecha, mes: fecha.slice(0, 7), categoria: porTransaccion ?? categoria(desc), region: moneda === "GBP" ? "uk" : "eu", concepto, importe: 0, moneda, eur: 0 });
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
  const lineas = [...doc.historico.filter((l) => !corte || l.mes < corte), ...Object.values(doc.liquidadas).filter((l) => !corte || l.mes >= corte)].map((l) => ({
    ...l,
    mesCobro: l.fecha?.slice(0, 7) ?? l.mes,
    mes: mesDevengo(l),
  }));
  return { lineas: lineas.sort((a, b) => (a.fecha ?? a.mes).localeCompare(b.fecha ?? b.mes)), actualizadoEn: doc.actualizadoEn, fechasDesde: corte };
}
export type DatosGastos = Awaited<ReturnType<typeof obtenerGastos>>;
