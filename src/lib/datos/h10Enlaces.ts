const DOMINIOS: Record<string, string> = { ES: "amazon.es", DE: "amazon.de", FR: "amazon.fr", IT: "amazon.it", GB: "amazon.co.uk" };

/** A product's page on that country's Amazon; without ASIN (Xray read from a screenshot), a search for its title. */
export function enlaceAmazon(pais: string, asin: string | null | undefined, titulo?: string): string {
  const dominio = DOMINIOS[pais] ?? "amazon.es";
  return asin ? `https://www.${dominio}/dp/${asin}` : `https://www.${dominio}/s?k=${encodeURIComponent((titulo ?? "").slice(0, 80))}`;
}
