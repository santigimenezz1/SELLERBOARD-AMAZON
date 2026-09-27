"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ENLACES = [
  { href: "/", texto: "Panel" },
  { href: "/productos", texto: "Productos" },
  { href: "/stock", texto: "Stock" },
  { href: "/costes", texto: "Costes" },
  { href: "/cuenta", texto: "Cuenta" },
] as const;

export function Nav() {
  const ruta = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {ENLACES.map((e) => {
        const activo = e.href === "/" ? ruta === "/" : ruta.startsWith(e.href);
        return (
          <Link
            key={e.href}
            href={e.href}
            aria-current={activo ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${activo ? "bg-white/[0.07] text-ink-100" : "text-ink-400 hover:bg-white/[0.04] hover:text-ink-100"}`}
          >
            {e.texto}
          </Link>
        );
      })}
    </nav>
  );
}
