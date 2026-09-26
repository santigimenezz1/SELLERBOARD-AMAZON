export function formatEuros(v: number | null, decimales = 2): string {
  return v === null ? "—" : v.toLocaleString("es-ES", { style: "currency", currency: "EUR", useGrouping: "always", minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

export function formatNumero(v: number): string {
  return v.toLocaleString("es-ES", { maximumFractionDigits: 0, useGrouping: "always" });
}

export function formatPorcentaje(v: number | null): string {
  return v === null ? "—" : `${v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

/** "2026-09-26" → "26 sept" */
export function formatDiaCorto(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
}

/** "2026-09-26" → "26 sept 2026" */
export function formatDiaLargo(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace(".", "");
}

export function formatFechaHora(d: Date): string {
  return d.toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
}

/** 31.99, "GBP" → "31,99 £" (Spanish formatting, the marketplace's currency). */
export function formatMoneda(v: number | null, moneda: string): string {
  return v === null ? "—" : v.toLocaleString("es-ES", { style: "currency", currency: moneda || "EUR", currencyDisplay: "narrowSymbol", useGrouping: "always" });
}
