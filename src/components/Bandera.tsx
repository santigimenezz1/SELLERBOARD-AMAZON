/** Country flag as an SVG (flag-icons): Windows doesn't render flag emoji. `codigo` is ISO 3166-1 alpha-2 ("ES"). */
export function Bandera({ codigo, className = "" }: { codigo: string; className?: string }) {
  if (!/^[A-Za-z]{2}$/.test(codigo)) return null;
  return <span aria-hidden className={`fi fi-${codigo.toLowerCase()} shrink-0 rounded-[2px] ${className}`} />;
}
