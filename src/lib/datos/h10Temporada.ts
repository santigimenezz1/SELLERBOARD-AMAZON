import type { HistorialBusquedas, MercadoXray } from "./h10Tipos";

/*
 * The year of a market, from its Xrays and the keyword's search history: revenue follows searches (checked with a
 * July and an October Xray of the same keyword: 15 and 13 € per search), so revenue per search, times each month's
 * searches, estimates every month. Revenue is the Xray's real one (sum of «ASIN Revenue»), not Helium 10's «Total
 * Revenue», which counts listing families several times.
 *
 * Revenue per search is as exact as can be: an Xray counts the 30 days before it was taken, so it's set against the
 * searches of those same weeks (when the history comes week by week, from the chart's CSV); with several Xrays of a
 * country (other months) it's the revenue of all of them over the searches of all of them.
 */

export type MesEstimado = { mes: string; busquedas: number; facturacion: number };

export type Temporada = {
  /** The month of the latest Xray (YYYY-MM) and the monthly searches its revenue is set against. */
  mesXray: string;
  busquedasXray: number;
  porBusqueda: number;
  /** How many Xrays the revenue per search comes from, and whether their exact 30 days were matched week by week. */
  xrays: number;
  semanasExactas: boolean;
  /** Every month of the history (up to 3 or 5 years), with its estimated revenue. */
  meses: MesEstimado[];
  /** The last 12 months of the history, with their estimated revenue. */
  ultimos12: MesEstimado[];
  anual: number;
  mediaMensual: number;
  fuerte: MesEstimado;
  flojo: MesEstimado;
  /** The latest Xray against the year's average: 0.6 = it was taken in a month 40 % below average. */
  xrayFrenteMedia: number;
  /** Searches of the last 12 months against the 12 before (0.15 = +15 %); null without two years of history. */
  crecimiento: number | null;
};

const suma = (v: number[]) => v.reduce((s, x) => s + x, 0);
const mesesEntre = (desde: string, hasta: string) => (Number(hasta.slice(0, 4)) - Number(desde.slice(0, 4))) * 12 + Number(hasta.slice(5, 7)) - Number(desde.slice(5, 7));
const DIA = 86_400_000;

/**
 * The monthly searches an Xray's revenue goes with. Week by week: the points of the 30 days before the Xray (or, when
 * the chart stops up to 2 weeks earlier, its last 4 weeks). Otherwise the Xray's month (or the nearest before, up to 2).
 */
function busquedasDe(m: MercadoXray, h: HistorialBusquedas): { busquedas: number; mes: string; exactas: boolean } | null {
  const fin = Date.parse(`${m.fecha.slice(0, 10)}T00:00:00Z`);
  if (h.semanas?.length) {
    const dentro = h.semanas.filter((s) => {
      const d = Date.parse(`${s.dia}T00:00:00Z`);
      return d <= fin && d > fin - 30 * DIA;
    });
    const ultima = Date.parse(`${h.semanas.at(-1)!.dia}T00:00:00Z`);
    const puntos = dentro.length >= 2 ? dentro : fin - ultima <= 14 * DIA && fin >= ultima ? h.semanas.slice(-4) : [];
    if (puntos.length) return { busquedas: suma(puntos.map((s) => s.busquedas)) / puntos.length, mes: puntos.at(-1)!.dia.slice(0, 7), exactas: true };
  }
  const fechaXray = m.fecha.slice(0, 7);
  const cercano = [...h.meses].reverse().find((x) => x.mes <= fechaXray && mesesEntre(x.mes, fechaXray) <= 2);
  if (cercano) return { busquedas: cercano.busquedas, mes: cercano.mes, exactas: false };
  return m.busquedas ? { busquedas: m.busquedas, mes: fechaXray, exactas: false } : null;
}

/**
 * The year estimated from a country's Xrays (`m` the latest, `anteriores` older ones) and its search history; null when
 * they can't be joined (no searches for any Xray).
 */
export function temporada(m: MercadoXray, h: HistorialBusquedas, anteriores: MercadoXray[] = []): Temporada | null {
  if (h.meses.length < 3 || m.facturacionTotal <= 0) return null;
  const pares = [m, ...anteriores]
    .filter((x) => x.facturacionTotal > 0)
    .map((x) => ({ x, b: busquedasDe(x, h) }))
    .filter((p): p is { x: MercadoXray; b: NonNullable<ReturnType<typeof busquedasDe>> } => !!p.b && p.b.busquedas > 0);
  const propio = pares.find((p) => p.x === m);
  if (!propio) return null;
  // Every Xray's revenue over every Xray's searches: one Xray taken in an odd month weighs less.
  const porBusqueda = suma(pares.map((p) => p.x.facturacionTotal)) / suma(pares.map((p) => p.b.busquedas));
  const meses = h.meses.map((x) => ({ ...x, facturacion: Math.round(x.busquedas * porBusqueda) }));
  const ultimos12 = meses.slice(-12);
  const anual = suma(ultimos12.map((x) => x.facturacion));
  const mediaMensual = anual / ultimos12.length;
  const orden = [...ultimos12].sort((a, b) => b.facturacion - a.facturacion);
  const anteriores12 = h.meses.slice(-24, -12);
  return {
    mesXray: propio.b.mes,
    busquedasXray: Math.round(propio.b.busquedas),
    porBusqueda,
    xrays: pares.length,
    semanasExactas: propio.b.exactas,
    meses,
    ultimos12,
    anual: Math.round((anual * 12) / ultimos12.length),
    mediaMensual: Math.round(mediaMensual),
    fuerte: orden[0],
    flojo: orden.at(-1)!,
    xrayFrenteMedia: mediaMensual ? m.facturacionTotal / mediaMensual : 1,
    crecimiento: anteriores12.length === 12 ? suma(ultimos12.map((x) => x.busquedas)) / Math.max(1, suma(anteriores12.map((x) => x.busquedas))) - 1 : null,
  };
}

/** «ene 26». */
export const nombreMes = (mes: string) => {
  const [y, mm] = mes.split("-").map(Number);
  return `${new Date(Date.UTC(y, mm - 1, 1)).toLocaleDateString("es-ES", { month: "short", timeZone: "UTC" }).replace(".", "")} ${String(y).slice(2)}`;
};
