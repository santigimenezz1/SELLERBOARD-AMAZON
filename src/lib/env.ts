/**
 * Normalises an environment value: trims it and drops any quotes at the start
 * and/or end. Some hosts (e.g. Railway's raw variable editor) keep the quotes
 * that a .env file uses around values — sometimes only one of them after a
 * partial edit — which would otherwise end up inside the Firebase API key,
 * bucket name or private key. None of our values legitimately start or end
 * with a quote.
 */
export function limpiarEnv(valor: string | undefined): string | undefined {
  if (valor === undefined) return undefined;
  return valor.trim().replace(/^["']+/, "").replace(/["']+$/, "").trim();
}
