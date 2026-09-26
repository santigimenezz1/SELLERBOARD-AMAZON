const nombres = new Intl.DisplayNames(["es"], { type: "region" });

/** "ES" → "España", "GB" → "Reino Unido". */
export function nombrePais(codigo: string): string {
  try {
    return nombres.of(codigo.toUpperCase()) ?? codigo;
  } catch {
    return codigo;
  }
}

/** "ES" → 🇪🇸 (regional indicator symbols). */
export function bandera(codigo: string): string {
  if (!/^[A-Za-z]{2}$/.test(codigo)) return "";
  return String.fromCodePoint(...[...codigo.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
