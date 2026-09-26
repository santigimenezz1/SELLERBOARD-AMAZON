import { inicioDia, sumarDias } from "./fechas";

/**
 * The period tiles of the dashboard (Sellerboard-style). The fixed ones are
 * always shown; an extra one appears when a custom period is chosen.
 */
export type PeriodoId = "hoy" | "ayer" | "mes" | "pronostico" | "mespasado" | "7d" | "30d" | "rango";

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

export function periodosFijos(hoy: string): Periodo[] {
  const ayer = sumarDias(hoy, -1);
  const finMesPasado = sumarDias(primeroDeMes(hoy), -1);
  return [
    { id: "hoy", nombre: "Hoy", desde: hoy, hasta: hoy },
    { id: "ayer", nombre: "Ayer", desde: ayer, hasta: ayer },
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
    return { id, nombre: "Personalizado", desde: a, hasta: b > hoy ? hoy : b };
  }
  return null;
}

/** Share of the current month already elapsed at `ahora` (0–1], used to project the month's sales. */
export function fraccionMesTranscurrida(hoy: string, ahora: Date): number {
  const inicio = inicioDia(primeroDeMes(hoy)).getTime();
  const fin = inicioDia(sumarDias(ultimoDeMes(hoy), 1)).getTime();
  return Math.min(1, Math.max((ahora.getTime() - inicio) / (fin - inicio), 1 / 1440));
}

/** "2026-09-26" → "26/09/2026" */
export function fechaCorta(dia: string): string {
  const [y, m, d] = dia.split("-");
  return `${d}/${m}/${y}`;
}

export function textoFechas(p: Periodo): string {
  return p.desde === p.hasta ? fechaCorta(p.desde) : `${fechaCorta(p.desde)} – ${fechaCorta(p.hasta)}`;
}
