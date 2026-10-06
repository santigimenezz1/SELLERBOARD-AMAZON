/*
 * Subscriptions: what's shared by the server and the page (pure functions, no Firestore).
 *
 * Only the first payment date is stored; the next one is worked out from it, moving forward whole periods once it
 * has passed, so a renewal never needs updating by hand.
 */

export type Periodicidad = "mensual" | "trimestral" | "semestral" | "anual";

export const PERIODICIDADES: { valor: Periodicidad; texto: string; meses: number }[] = [
  { valor: "mensual", texto: "Mensual", meses: 1 },
  { valor: "trimestral", texto: "Trimestral", meses: 3 },
  { valor: "semestral", texto: "Semestral", meses: 6 },
  { valor: "anual", texto: "Anual", meses: 12 },
];
export const esPeriodicidad = (v: unknown): v is Periodicidad => PERIODICIDADES.some((p) => p.valor === v);
const mesesDe = (p: Periodicidad) => PERIODICIDADES.find((x) => x.valor === p)!.meses;

export type Suscripcion = {
  id: string;
  nombre: string;
  importe: number;
  moneda: string;
  periodicidad: Periodicidad;
  /** A payment day (YYYY-MM-DD): the first one, or any later one. */
  fechaPago: string;
  /** Days before the payment the warning starts. */
  avisarDias: number;
  /** How it's paid, in words (card, PayPal, bank…): never card numbers. */
  metodo: string;
  nota: string;
  /** Cancelled ones stay listed but neither warn nor count in the totals. */
  activa: boolean;
  creadaEn: string;
};

/** `fecha` moved forward `meses` months, keeping its day (31 → the month's last day when it has fewer). */
function sumarMeses(fecha: string, meses: number, dia: number): string {
  const [y, m] = fecha.split("-").map(Number);
  const total = m - 1 + meses;
  const anio = y + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return `${anio}-${String(mes + 1).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/** The next payment on or after `hoy` (YYYY-MM-DD). */
export function proximoPago(s: Pick<Suscripcion, "fechaPago" | "periodicidad">, hoy: string): string {
  const dia = Number(s.fechaPago.slice(8, 10));
  const paso = mesesDe(s.periodicidad);
  let fecha = s.fechaPago;
  for (let k = 1; fecha < hoy; k++) fecha = sumarMeses(s.fechaPago, k * paso, dia);
  return fecha;
}

export const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

/** What a subscription costs a month, to compare monthly and yearly ones. */
export const alMes = (s: Pick<Suscripcion, "importe" | "periodicidad">) => s.importe / mesesDe(s.periodicidad);

/** Active subscriptions whose next payment is within their warning days. */
export const porVencer = (lista: Suscripcion[], hoy: string) => lista.filter((s) => s.activa && diasEntre(hoy, proximoPago(s, hoy)) <= s.avisarDias);
