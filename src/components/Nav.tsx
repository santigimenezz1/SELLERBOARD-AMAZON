"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const ENLACES = [
  { href: "/", texto: "Panel" },
  { href: "/productos", texto: "Productos" },
  { href: "/stock", texto: "Stock" },
  { href: "/gastos", texto: "Gastos" },
  { href: "/tendencias", texto: "Tendencias" },
  // Hidden for now (the page, its data and the weekly load stay as they are): uncomment to show it again.
  // { href: "/palabras-clave", texto: "Palabras clave" },
  { href: "/documentos", texto: "Documentos" },
  { href: "/cuenta", texto: "Estado de la cuenta" },
] as const;

type Estado = "ok" | "mal" | null;
const esActivo = (href: string, ruta: string) => (href === "/" ? ruta === "/" : ruta.startsWith(href));

/** Green or red dot of «Estado de la cuenta»: every country at 200+ points, or any below. */
function Punto({ href, estadoCuenta }: { href: string; estadoCuenta: Estado }) {
  if (href !== "/cuenta" || !estadoCuenta) return null;
  return (
    <span
      aria-hidden
      title={estadoCuenta === "ok" ? "Todos los países en «Adecuado» (200 puntos o más)" : "Algún país por debajo de 200 puntos"}
      className={`size-1.5 shrink-0 rounded-full ${estadoCuenta === "ok" ? "bg-success" : "bg-danger"}`}
    />
  );
}

/**
 * The full menu, from tablet width up (phones use <MenuMovil>). `fila`: on its own row under the logo, for
 * tablets where it doesn't fit next to it; otherwise inline next to the logo, on wider screens.
 */
export function Nav({ estadoCuenta, fila = false }: { estadoCuenta: Estado; fila?: boolean }) {
  const ruta = usePathname();
  return (
    <nav className={fila ? "-mx-2.5 hidden items-center gap-1 overflow-x-auto pb-2 md:flex min-[1080px]:hidden" : "hidden items-center gap-1 min-[1080px]:flex"}>
      {ENLACES.map((e) => {
        const activo = esActivo(e.href, ruta);
        return (
          <Link
            key={e.href}
            href={e.href}
            aria-current={activo ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition-colors ${activo ? "bg-white/[0.07] text-ink-100" : "text-ink-400 hover:bg-white/[0.04] hover:text-ink-100"}`}
          >
            <Punto href={e.href} estadoCuenta={estadoCuenta} />
            {e.texto}
          </Link>
        );
      })}
    </nav>
  );
}

/** Hamburger button and the menu it opens under the header, on phones only (under 768 px). */
export function MenuMovil({ estadoCuenta, email }: { estadoCuenta: Estado; email: string | null }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [rutaAbierta, setRutaAbierta] = useState(ruta);
  // Choosing a section closes it.
  if (abierto && rutaAbierta !== ruta) {
    setAbierto(false);
    setRutaAbierta(ruta);
  }

  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto]);

  return (
    <div className="md:hidden">
      <button
        onClick={() => {
          setAbierto(!abierto);
          setRutaAbierta(ruta);
        }}
        aria-expanded={abierto}
        aria-controls="menu-movil"
        aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
        className="flex size-9 items-center justify-center rounded-lg text-ink-300 transition-colors hover:bg-white/[0.06] hover:text-ink-100"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          {abierto ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {abierto && (
        <>
          {/* Tapping outside closes it. */}
          <div className="fixed inset-x-0 top-16 bottom-0 z-30 bg-ink-950/60 backdrop-blur-sm" onClick={() => setAbierto(false)} aria-hidden />
          <nav id="menu-movil" className="fixed inset-x-0 top-16 z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-white/[0.06] bg-ink-950 px-4 pt-2 pb-4 shadow-soft">
            <ul className="flex flex-col">
              {ENLACES.map((e) => {
                const activo = esActivo(e.href, ruta);
                return (
                  <li key={e.href}>
                    <Link
                      href={e.href}
                      onClick={() => setAbierto(false)}
                      aria-current={activo ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-3 text-[15px] transition-colors ${activo ? "bg-white/[0.07] text-ink-100" : "text-ink-300 hover:bg-white/[0.04] hover:text-ink-100"}`}
                    >
                      <Punto href={e.href} estadoCuenta={estadoCuenta} />
                      {e.texto}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {email && <p className="mt-2 truncate border-t border-white/[0.06] px-3 pt-3 text-xs text-ink-500">{email}</p>}
          </nav>
        </>
      )}
    </div>
  );
}
