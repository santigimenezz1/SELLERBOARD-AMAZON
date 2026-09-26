"use client";

import { useState } from "react";
import { RANGOS, type Rango } from "@/lib/datos/fechas";
import type { Marketplace } from "@/lib/datos/tipos";
import { bandera } from "@/lib/datos/paises";
import { useNavegarPanel } from "./Transicion";

type Props = { rango: Rango; desde: string; hasta: string; pais: string | null; marketplaces: Marketplace[]; base?: string };

export function Filtros({ rango, desde, hasta, pais, marketplaces, base = "/" }: Props) {
  const { navegar } = useNavegarPanel();
  const [personal, setPersonal] = useState({ desde, hasta });
  const [abierto, setAbierto] = useState(rango === "personalizado");

  function ir(cambios: Record<string, string | null>) {
    const actual: Record<string, string | null> = {
      rango,
      desde: rango === "personalizado" ? desde : null,
      hasta: rango === "personalizado" ? hasta : null,
      pais,
    };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...actual, ...cambios })) if (v) p.set(k, v);
    navegar(`${base}?${p.toString()}`);
  }

  const presets = (Object.keys(RANGOS) as Rango[]).filter((r) => r !== "personalizado");
  const boton = (activo: boolean) =>
    `h-8 rounded-lg px-3 text-sm transition-colors ${activo ? "bg-white/[0.09] font-medium text-ink-100" : "text-ink-400 hover:text-ink-100"}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Rango de fechas" className="flex flex-wrap gap-1 rounded-xl border border-white/[0.06] bg-ink-900/70 p-1">
        {presets.map((r) => (
          <button
            key={r}
            onClick={() => {
              setAbierto(false);
              ir({ rango: r, desde: null, hasta: null });
            }}
            aria-pressed={rango === r}
            className={boton(rango === r)}
          >
            {RANGOS[r]}
          </button>
        ))}
        <button onClick={() => setAbierto((v) => !v)} aria-pressed={rango === "personalizado"} aria-expanded={abierto} className={boton(rango === "personalizado")}>
          Personalizado
        </button>
      </div>

      {abierto && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ir({ rango: "personalizado", ...personal });
          }}
        >
          <label className="sr-only" htmlFor="desde">
            Desde
          </label>
          <input id="desde" type="date" value={personal.desde} max={personal.hasta} onChange={(e) => setPersonal((p) => ({ ...p, desde: e.target.value }))} className={campo} />
          <span className="text-ink-400">–</span>
          <label className="sr-only" htmlFor="hasta">
            Hasta
          </label>
          <input id="hasta" type="date" value={personal.hasta} min={personal.desde} onChange={(e) => setPersonal((p) => ({ ...p, hasta: e.target.value }))} className={campo} />
          <button type="submit" disabled={!personal.desde || !personal.hasta} className="h-9 rounded-lg bg-white/[0.08] px-3 text-sm text-ink-100 hover:bg-white/[0.12] disabled:opacity-50">
            Aplicar
          </button>
        </form>
      )}

      <label className="sr-only" htmlFor="pais">
        País
      </label>
      <select id="pais" value={pais ?? ""} onChange={(e) => ir({ pais: e.target.value || null })} className={campo}>
        <option value="">🌍 Todos los países</option>
        {marketplaces.map((m) => (
          <option key={m.id} value={m.id}>
            {bandera(m.codigoPais)} {m.pais}
          </option>
        ))}
      </select>
    </div>
  );
}

const campo =
  "h-9 rounded-lg border border-white/[0.08] bg-ink-900 px-2.5 text-sm text-ink-100 outline-none [color-scheme:dark] hover:border-white/[0.14] focus:border-accent-500/70";
