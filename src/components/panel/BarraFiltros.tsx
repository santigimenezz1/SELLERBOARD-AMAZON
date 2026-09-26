"use client";

import { useEffect, useRef, useState } from "react";
import type { Marketplace } from "@/lib/datos/tipos";
import { Bandera } from "@/components/Bandera";
import { useNavegarPanel } from "./Transicion";
import { urlPanel, type EstadoUrl } from "./url";

/** "Período" menu (adds an extra tile) and marketplace filter, top right of the dashboard. */
export function BarraFiltros({ base, estado, marketplaces, hoy }: { base: string; estado: EstadoUrl; marketplaces: Marketplace[]; hoy: string }) {
  const { navegar } = useNavegarPanel();
  const [abierto, setAbierto] = useState(false);
  const [rango, setRango] = useState({ desde: estado.desde ?? "", hasta: estado.hasta ?? "" });
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", cerrar);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("keydown", cerrar);
    };
  }, [abierto]);

  function elegir(e: "7d" | "30d" | "rango") {
    setAbierto(false);
    navegar(urlPanel(base, estado, e === "rango" ? { e, p: e, desde: rango.desde, hasta: rango.hasta } : { e, p: e, desde: null, hasta: null }));
  }

  const seleccionado = marketplaces.find((m) => m.id === estado.pais);
  const opcion = (activa: boolean) =>
    `flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${activa ? "font-medium text-ink-100" : "text-ink-300"} hover:bg-white/[0.05]`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div ref={caja} className="relative">
        <button onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} aria-haspopup="dialog" className={`${campo} inline-flex items-center gap-2`}>
          <svg viewBox="0 0 16 16" className="size-4 text-ink-400" aria-hidden>
            <rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Período
          <Flecha />
        </button>
        {abierto && (
          <div role="dialog" aria-label="Elegir período" className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-white/[0.08] bg-ink-850 p-2 shadow-soft">
            <button onClick={() => elegir("7d")} className={opcion(estado.e === "7d")}>
              Últimos 7 días {estado.e === "7d" && <span aria-hidden>✓</span>}
            </button>
            <button onClick={() => elegir("30d")} className={opcion(estado.e === "30d")}>
              Últimos 30 días {estado.e === "30d" && <span aria-hidden>✓</span>}
            </button>
            <form
              className="mt-2 border-t border-white/[0.06] px-1 pt-3 pb-1"
              onSubmit={(e) => {
                e.preventDefault();
                elegir("rango");
              }}
            >
              <p className="mb-2 px-2 text-xs text-ink-400">Rango personalizado</p>
              <div className="flex items-center gap-2 px-2">
                <label className="sr-only" htmlFor="rango-desde">
                  Desde
                </label>
                <input id="rango-desde" type="date" max={rango.hasta || hoy} value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} className={fecha} />
                <span className="text-ink-400">–</span>
                <label className="sr-only" htmlFor="rango-hasta">
                  Hasta
                </label>
                <input id="rango-hasta" type="date" min={rango.desde} max={hoy} value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} className={fecha} />
              </div>
              <button
                type="submit"
                disabled={!rango.desde || !rango.hasta}
                className="mt-3 h-8 w-full rounded-lg bg-accent-500 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-40"
              >
                Aplicar
              </button>
            </form>
          </div>
        )}
      </div>

      <label className="sr-only" htmlFor="pais">
        Mercado
      </label>
      <div className="relative flex items-center">
        {/* <option> can't hold images and Windows has no flag emoji: the selected market's flag sits inside the field. */}
        <span className="pointer-events-none absolute left-3 flex text-sm">
          {seleccionado ? <Bandera codigo={seleccionado.codigoPais} /> : <IconoMundo />}
        </span>
        <select id="pais" value={estado.pais ?? ""} onChange={(e) => navegar(urlPanel(base, estado, { pais: e.target.value || null }))} className={`${campo} appearance-none pr-8 pl-9`}>
          <option value="">Todos los mercados</option>
          {marketplaces.map((m) => (
            <option key={m.id} value={m.id}>
              {m.pais}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 flex">
          <Flecha />
        </span>
      </div>
    </div>
  );
}

function Flecha() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 text-ink-400" aria-hidden>
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconoMundo() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 text-ink-400" aria-hidden>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 8h12M8 2c1.8 1.7 2.7 3.7 2.7 6S9.8 12.3 8 14c-1.8-1.7-2.7-3.7-2.7-6S6.2 3.7 8 2z" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

const campo =
  "h-9 rounded-lg border border-white/[0.08] bg-ink-900 px-3 text-sm text-ink-100 outline-none [color-scheme:dark] hover:border-white/[0.16] focus:border-accent-500/70";
const fecha = "h-8 w-full min-w-0 rounded-md border border-white/[0.08] bg-ink-950/60 px-2 text-xs text-ink-100 [color-scheme:dark] outline-none focus:border-accent-500/70";
