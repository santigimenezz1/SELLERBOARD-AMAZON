import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { eventosFinancieros, gruposFinancieros, type EventosFinancieros } from "@/lib/amazon/apis";
import { eurPorUnidad } from "@/lib/amazon/tiposCambio";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * What Amazon paid into the bank: each settlement period ends in a transfer (every few days per region).
 * Only transfers that went out (or are on their way) count; a period that closes negative isn't paid, its
 * debt moves to the next ones or is charged to the card.
 *
 * It also keeps Amazon's compensations (units lost or damaged in its warehouses, refunds whose item never
 * came back…): income of the account, not linked to a sale's payout.
 *
 * One doc, `config/ingresos`, kept in memory; the complete sync refreshes it.
 */

export type Pago = { id: string; fecha: string; mes: string; region: "eu" | "uk"; importe: number; moneda: string; eur: number; enCamino: boolean };
/** importe > 0: Amazon paid the seller. */
export type Compensacion = { fecha: string; mes: string; tipo: string; region: "eu" | "uk"; importe: number; moneda: string; eur: number };
type Doc = { pagos: Pago[]; compensaciones: Record<string, Compensacion>; actualizadoEn: string | null };

const DESDE = new Date("2025-11-01T00:00:00Z");
const g = globalThis as unknown as { __ingresos?: Doc };
const ref = () => adminDb().collection("config").doc("ingresos");

async function leer(): Promise<Doc> {
  if (g.__ingresos) {
    // A doc cached by older code (dev hot reload) may lack newer fields.
    g.__ingresos.compensaciones ??= {};
    return g.__ingresos;
  }
  const snap = await ref().get();
  contarLecturas(1);
  g.__ingresos = {
    pagos: (snap.get("pagos") as Pago[] | undefined) ?? [],
    compensaciones: (snap.get("compensaciones") as Doc["compensaciones"] | undefined) ?? {},
    actualizadoEn: (snap.get("actualizadoEn") as string | undefined) ?? null,
  };
  return g.__ingresos;
}

/** Re-reads every payout since DESDE (a few pages) and saves them when something changed. */
export async function actualizarIngresos(): Promise<number> {
  const pagos: Pago[] = [];
  for (const gr of await gruposFinancieros(DESDE)) {
    const estado = gr.FundTransferStatus ?? "";
    if ((estado !== "Succeeded" && estado !== "Processing") || !gr.FundTransferDate || !gr.OriginalTotal) continue;
    const importe = Number(gr.OriginalTotal.CurrencyAmount) || 0;
    if (importe <= 0) continue;
    const moneda = gr.OriginalTotal.CurrencyCode ?? "EUR";
    const fecha = gr.FundTransferDate.slice(0, 10);
    // Amazon gives the euros it sent when it converts; otherwise the ECB rate of that day.
    const convertido = gr.ConvertedTotal?.CurrencyCode === "EUR" ? Number(gr.ConvertedTotal.CurrencyAmount) : NaN;
    const eur = Number.isFinite(convertido) ? convertido : importe * (await eurPorUnidad(moneda, new Date(`${fecha}T12:00:00Z`)));
    pagos.push({
      id: gr.FinancialEventGroupId ?? `${fecha}|${moneda}|${importe}`,
      fecha,
      mes: fecha.slice(0, 7),
      region: moneda === "GBP" ? "uk" : "eu",
      importe,
      moneda,
      eur: Math.round(eur * 100) / 100,
      enCamino: estado === "Processing",
    });
  }
  pagos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const doc = await leer();
  if (JSON.stringify(doc.pagos) !== JSON.stringify(pagos)) await guardar({ ...doc, pagos });
  return pagos.length;
}

async function guardar(doc: Doc) {
  doc.actualizadoEn = new Date().toISOString();
  await ref().set(doc);
  contarEscrituras(1);
  g.__ingresos = doc;
}

// Adjustments that aren't compensations: reserve moves, debt moves, failed payouts (cash, not income), and
// clawbacks (Amazon taking a compensation back: counted with the charges).
const NO_ES_COMPENSACION = /reserve|debt|disbursement|clawback/i;

/** Saves the compensations among these adjustments (idempotent: each one keyed by its own fields). */
export async function guardarCompensaciones(ajustes: EventosFinancieros["AdjustmentEventList"]): Promise<number> {
  const doc = await leer();
  const nuevas: Record<string, Compensacion> = {};
  for (const a of ajustes) {
    const tipo = a.AdjustmentType ?? "";
    const importe = Number(a.AdjustmentAmount?.CurrencyAmount) || 0;
    if (!tipo || NO_ES_COMPENSACION.test(tipo) || !importe || !a.PostedDate) continue;
    const moneda = a.AdjustmentAmount?.CurrencyCode ?? "EUR";
    const id = `${tipo}|${a.PostedDate}|${moneda}|${importe}`.replace(/[./]/g, "_");
    if (doc.compensaciones[id]) continue;
    const fecha = a.PostedDate.slice(0, 10);
    const eur = importe * (await eurPorUnidad(moneda, new Date(`${fecha}T12:00:00Z`)));
    nuevas[id] = { fecha, mes: fecha.slice(0, 7), tipo, region: moneda === "GBP" ? "uk" : "eu", importe, moneda, eur: Math.round(eur * 100) / 100 };
  }
  if (Object.keys(nuevas).length) await guardar({ ...doc, compensaciones: { ...doc.compensaciones, ...nuevas } });
  return Object.keys(nuevas).length;
}

/** One-off: the compensations since `desdeMes` ("YYYY-MM"), month by month. */
export async function importarCompensaciones(desdeMes: string): Promise<number> {
  let n = 0;
  const hasta = new Date(Date.now() - 5 * 60_000);
  for (let d = new Date(`${desdeMes}-01T00:00:00Z`); d < hasta; ) {
    const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    n += await guardarCompensaciones((await eventosFinancieros(d, fin < hasta ? fin : hasta)).AdjustmentEventList);
    d = fin;
  }
  return n;
}

export async function obtenerIngresos() {
  return leer();
}
export type DatosIngresos = Awaited<ReturnType<typeof obtenerIngresos>>;
