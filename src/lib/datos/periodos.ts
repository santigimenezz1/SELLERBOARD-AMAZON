import { inicioDia, sumarDias } from "./fechas";

/**
 * The period tiles of the dashboard (Sellerboard-style). The fixed ones are
 * always shown; an extra one appears when a custom period is chosen.
 */
export type PeriodoId = "hoy" | "ayer" | "semana" | "mes" | "pronostico" | "mespasado" | "7d" | "30d" | "rango";

export type Periodo = {
  id: PeriodoId;
  nombre: string;
  /** Madrid days, inclusive. */
  desde: string;
  hasta: string;
  /** A projection, not real sales: its tile can't be selected. */
  esPronostico?: boolean;
};

const primeroDeMes = (dia: string) => `${dia.slice(0, 8)}01`;
function ultimoDeMes(dia: string): string {
  const [y, m] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Monday of the week that contains `dia` (Spanish weeks start on Monday). */
export function lunesDe(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  const diaSemana = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return sumarDias(dia, -((diaSemana + 6) % 7));
}

export function periodosFijos(hoy: string): Periodo[] {
  const ayer = sumarDias(hoy, -1);
  const finMesPasado = sumarDias(primeroDeMes(hoy), -1);
  return [
    { id: "hoy", nombre: "Hoy", desde: hoy, hasta: hoy },
    { id: "ayer", nombre: "Ayer", desde: ayer, hasta: ayer },
    { id: "semana", nombre: "Esta semana", desde: lunesDe(hoy), hasta: hoy },
    { id: "mes", nombre: "Este mes", desde: primeroDeMes(hoy), hasta: hoy },
    { id: "pronostico", nombre: "Este mes (pronóstico)", desde: primeroDeMes(hoy), hasta: ultimoDeMes(hoy), esPronostico: true },
    { id: "mespasado", nombre: "El mes pasado", desde: primeroDeMes(finMesPasado), hasta: finMesPasado },
  ];
}

/** Periods chosen from the "Período" menu, shown as an extra tile. */
export function periodoExtra(id: string | undefined, hoy: string, desde?: string, hasta?: string): Periodo | null {
  if (id === "7d") return { id, nombre: "Últimos 7 días", desde: sumarDias(hoy, -6), hasta: hoy };
  if (id === "30d") return { id, nombre: "Últimos 30 días", desde: sumarDias(hoy, -29), hasta: hoy };
  if (id === "rango" && desde && hasta && /^\d{4}-\d{2}-\d{2}$/.test(desde) && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde];
    const fin = b > hoy ? hoy : b;
    // A single day (e.g. picked by clicking a bar of the chart) is named after that day.
    return { id, nombre: a === fin ? nombreDia(a) : "Personalizado", desde: a, hasta: fin };
  }
  return null;
}

/** Share of the current month already elapsed at `ahora` (0–1], used to project the month's sales. */
export function fraccionMesTranscurrida(hoy: string, ahora: Date): number {
  const inicio = inicioDia(primeroDeMes(hoy)).getTime();
  const fin = inicioDia(sumarDias(ultimoDeMes(hoy), 1)).getTime();
  return Math.min(1, Math.max((ahora.getTime() - inicio) / (fin - inicio), 1 / 1440));
}

/** "2026-09-24" → "Jue 24/09" */
export function nombreDia(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  const semana = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-ES", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** First and last day of a "YYYY-MM" month. */
export function diasDelMes(mes: string): { desde: string; hasta: string } {
  return { desde: `${mes}-01`, hasta: ultimoDeMes(`${mes}-01`) };
}

/** "2026-09" → "Septiembre 2026" */
export function nombreMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).replace(" de ", " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** The current month and the ones before it, newest first ("YYYY-MM"). */
export function ultimosMeses(hoy: string, n = 12): string[] {
  const [y, m] = hoy.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
}

/** "2026-09-26" → "26/09/2026" */
export function fechaCorta(dia: string): string {
  const [y, m, d] = dia.split("-");
  return `${d}/${m}/${y}`;
}

export function textoFechas(p: Periodo): string {
  return p.desde === p.hasta ? fechaCorta(p.desde) : `${fechaCorta(p.desde)} – ${fechaCorta(p.hasta)}`;
}
