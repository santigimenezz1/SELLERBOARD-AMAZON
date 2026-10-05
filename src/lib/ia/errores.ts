import Anthropic from "@anthropic-ai/sdk";

/** A readable message for an error of the Claude API (used by the chat and by the Helium 10 reader). */
export function mensajeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "La clave de la IA no es válida: revisa ANTHROPIC_API_KEY";
  if (e instanceof Anthropic.RateLimitError) return "Demasiadas peticiones seguidas a la IA: espera unos segundos y vuelve a probar";
  if (e instanceof Anthropic.BadRequestError && /credit|balance/i.test(e.message)) return "No queda saldo en la cuenta de Anthropic: recarga créditos en console.anthropic.com";
  if (e instanceof Anthropic.APIError) return `La IA no respondió (error ${e.status ?? "de conexión"}). Prueba otra vez.`;
  return e instanceof Error ? e.message : "No se pudo completar";
}
