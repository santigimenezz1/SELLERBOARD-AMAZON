/**
 * Standard VAT rate per marketplace country, used only when Amazon doesn't
 * report the tax of a sale (common in EU marketplaces, where it's simply
 * inside the price). Distance sales inside the EU (OSS) pay the buyer's
 * country rate, and the marketplace country is the best proxy we have for it.
 * Reduced rates don't apply to consumer electronics.
 */
const TIPO_GENERAL: Record<string, number> = {
  ES: 0.21,
  DE: 0.19,
  FR: 0.2,
  IT: 0.22,
  NL: 0.21,
  BE: 0.21,
  IE: 0.23,
  AT: 0.2,
  PT: 0.23,
  SE: 0.25,
  PL: 0.23,
  GB: 0.2,
  TR: 0.2,
};

/** Standard rate of a country ("ES" → 0.21), or undefined if unknown. */
export function tipoIvaGeneral(codigoPais: string | undefined): number | undefined {
  return codigoPais ? TIPO_GENERAL[codigoPais.toUpperCase()] : undefined;
}

/** VAT contained in a VAT-inclusive amount: 121 € in Spain → 21 €. Null if the country's rate is unknown. */
export function ivaIncluido(importe: number, codigoPais: string | undefined): number | null {
  const tipo = codigoPais ? TIPO_GENERAL[codigoPais.toUpperCase()] : undefined;
  if (tipo === undefined) return null;
  return (importe * tipo) / (1 + tipo);
}
