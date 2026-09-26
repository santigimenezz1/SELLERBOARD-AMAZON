/**
 * Calendar days are Madrid days: "hoy" and "ayer" follow the shop's clock, not
 * UTC, so an order at 00:30 in Spain lands on the right day.
 */
export const ZONA = "Europe/Madrid";

const formatoDia = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });

/** Date → "2026-09-26" (Madrid day). */
export function diaMadrid(d: Date): string {
  return formatoDia.format(d);
}

/** Milliseconds Madrid is ahead of UTC at that instant (3600000 or 7200000). */
function desfase(d: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: ZONA, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(d)
      .map((x) => [x.type, Number(x.value)]),
  );
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000;
}

/** "2026-09-26" → the instant it starts in Madrid (as a UTC Date). */
export function inicioDia(dia: string): Date {
  const [y, m, d] = dia.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  // Two passes handle days where the DST change happens.
  let t = utc - desfase(new Date(utc));
  t = utc - desfase(new Date(t));
  return new Date(t);
}

export function sumarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function esDiaValido(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export const RANGOS = {
  hoy: "Hoy",
  ayer: "Ayer",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  mes: "Mes actual",
  personalizado: "Personalizado",
} as const;

export type Rango = keyof typeof RANGOS;

/** Resolves a preset (or a custom desde/hasta) to inclusive Madrid days. */
export function resolverRango(rango: string | undefined, desde?: string, hasta?: string, ahora = new Date()): { rango: Rango; desde: string; hasta: string } {
  const hoy = diaMadrid(ahora);
  switch (rango) {
    case "hoy":
      return { rango, desde: hoy, hasta: hoy };
    case "ayer": {
      const ayer = sumarDias(hoy, -1);
      return { rango, desde: ayer, hasta: ayer };
    }
    case "7d":
      return { rango, desde: sumarDias(hoy, -6), hasta: hoy };
    case "mes":
      return { rango, desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
    case "personalizado":
      if (esDiaValido(desde) && esDiaValido(hasta)) {
        return desde <= hasta ? { rango, desde, hasta } : { rango, desde: hasta, hasta: desde };
      }
      break;
  }
  return { rango: "30d", desde: sumarDias(hoy, -29), hasta: hoy };
}

/** Every day from desde to hasta, inclusive. */
export function diasEntre(desde: string, hasta: string): string[] {
  const res: string[] = [];
  for (let d = desde; d <= hasta && res.length < 400; d = sumarDias(d, 1)) res.push(d);
  return res;
}
