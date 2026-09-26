const nombres = new Intl.DisplayNames(["es"], { type: "region" });

/** "ES" → "España", "GB" → "Reino Unido". */
export function nombrePais(codigo: string): string {
  try {
    return nombres.of(codigo.toUpperCase()) ?? codigo;
  } catch {
    return codigo;
  }
}

