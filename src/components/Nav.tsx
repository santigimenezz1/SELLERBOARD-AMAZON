"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ENLACES = [
  { href: "/", texto: "Panel" },
  { href: "/productos", texto: "Productos" },
  { href: "/stock", texto: "Stock" },
  { href: "/tendencias", texto: "Tendencias" },
  { href: "/gastos", texto: "Gastos" },
  { href: "/cuenta", texto: "Estado de la cuenta" },
] as const;

/** `estadoCuenta`: green «Estado de la cuenta» when every country is at 200+ points, red when any is below. */
export function Nav({ estadoCuenta }: { estadoCuenta: "ok" | "mal" | null }) {
  const ruta = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {ENLACES.map((e) => {
        const activo = e.href === "/" ? ruta === "/" : ruta.startsWith(e.href);
        const color = e.href === "/cuenta" && estadoCuenta ? (estadoCuenta === "ok" ? "text-success" : "text-danger") : null;
        return (
          <Link
            key={e.href}
            href={e.href}
            aria-current={activo ? "page" : undefined}
            title={color ? (estadoCuenta === "ok" ? "Todos los países en «Adecuado» (200 puntos o más)" : "Algún país por debajo de 200 puntos") : undefined}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${activo ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"} ${color ?? (activo ? "text-ink-100" : "text-ink-400 hover:text-ink-100")}`}
          >
            {color && <span aria-hidden className={`size-1.5 rounded-full ${estadoCuenta === "ok" ? "bg-success" : "bg-danger"}`} />}
            {e.texto}
          </Link>
        );
      })}
    </nav>
  );
}
