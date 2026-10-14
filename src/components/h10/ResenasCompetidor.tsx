"use client";

import { useState } from "react";
import type { ResenaCompleta } from "@/lib/datos/h10Tipos";
import { formatNumero } from "@/lib/format";

/** Reviews shown at a time. */
const POR_PAGINA = 20;

const Estrellas = ({ n }: { n: number }) => (
  <span aria-label={`${n} de 5 estrellas`} className="tracking-tight whitespace-nowrap">
    <span className="text-accent-400">{"★".repeat(n)}</span>
    <span className="text-ink-600">{"★".repeat(5 - n)}</span>
  </span>
);

const IDIOMAS: Record<string, string> = { en: "inglés", de: "alemán", fr: "francés", it: "italiano", nl: "neerlandés", sv: "sueco", pl: "polaco", pt: "portugués", tr: "turco", ar: "árabe" };

/** One review: in Spanish (its translation when it was in another language), with its original a tap away. */
function Resena({ r }: { r: ResenaCompleta }) {
  const [original, setOriginal] = useState(false);
  const traducida = !!r.textoEs || !!r.tituloEs;
  const titulo = traducida && !original ? r.tituloEs || r.titulo : r.titulo;
  const texto = traducida && !original ? r.textoEs || r.texto : r.texto;
  return (
    <li className="flex flex-col gap-1 py-3 text-sm">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
        <Estrellas n={r.estrellas} />
        {titulo && <span className="font-semibold text-ink-100">{titulo}</span>}
      </span>
      <span className="leading-relaxed whitespace-pre-line text-ink-200">{texto}</span>
      <span className="flex flex-wrap gap-x-2 text-[11px] text-ink-500">
        {r.autor && <span>{r.autor}</span>}
        {r.fecha && <span>· {r.fecha}</span>}
        {r.verificada && <span className="text-success">· Compra verificada</span>}
        {r.variante && <span>· {r.variante}</span>}
        {r.util ? <span>· {r.util} les resultó útil</span> : null}
        {traducida && (
          <button onClick={() => setOriginal((x) => !x)} className="text-accent-300 hover:text-accent-400">
            · {original ? "Ver en español" : `Traducida del ${IDIOMAS[r.idioma ?? ""] ?? r.idioma} · Ver original`}
          </button>
        )}
      </span>
    </li>
  );
}

/**
 * Every review of a competitor, in Spanish (translated when needed, the original a tap away): how many of each star
 * (each bar filters the list), a text search and the reviews themselves, the lowest stars first when filtering.
 */
export function ResenasCompetidor({ resenas }: { resenas: ResenaCompleta[] }) {
  const [estrellas, setEstrellasElegidas] = useState<number | null>(null);
  const [busqueda, setBusquedaEscrita] = useState("");
  const [visibles, setVisibles] = useState(POR_PAGINA);
  // A new filter starts again from the first page.
  const setEstrellas = (n: number | null) => {
    setEstrellasElegidas(n);
    setVisibles(POR_PAGINA);
  };
  const setBusqueda = (t: string) => {
    setBusquedaEscrita(t);
    setVisibles(POR_PAGINA);
  };
  const total = resenas.length;
  const cuantas = (n: number) => resenas.filter((r) => r.estrellas === n).length;
  const max = Math.max(1, ...[1, 2, 3, 4, 5].map(cuantas));
  const texto = busqueda.trim().toLowerCase();
  // The search looks in the Spanish and in the original words.
  const lista = resenas.filter((r) => (estrellas === null || r.estrellas === estrellas) && (!texto || `${r.titulo} ${r.texto} ${r.tituloEs ?? ""} ${r.textoEs ?? ""}`.toLowerCase().includes(texto)));

  return (
    <div className="flex flex-col gap-4">
      {/* Stars: a bar each, from 5 to 1; tapping one shows only those reviews. */}
      <div className="grid gap-1.5">
        {[5, 4, 3, 2, 1].map((n) => {
          const c = cuantas(n);
          const activa = estrellas === n;
          return (
            <button
              key={n}
              onClick={() => setEstrellas(activa ? null : n)}
              aria-pressed={activa}
              disabled={c === 0}
              className={`grid grid-cols-[64px_1fr_110px] items-center gap-3 rounded-lg border px-3 py-1.5 text-left text-sm transition-colors disabled:opacity-40 ${activa ? "border-accent-500/60 bg-accent-500/10" : "border-transparent hover:bg-white/[0.04]"}`}
            >
              <span className="font-medium text-ink-100">
                {n} <span className="text-accent-400">★</span>
              </span>
              <span className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                <span className={`block h-full rounded-full ${n >= 4 ? "bg-success" : n === 3 ? "bg-warning" : "bg-danger"}`} style={{ width: `${(c / max) * 100}%` }} />
              </span>
              <span className="tabular text-right text-ink-300">
                {formatNumero(c)} <span className="text-xs text-ink-500">· {total ? Math.round((c / total) * 100) : 0} %</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setEstrellas(null)}
          aria-pressed={estrellas === null}
          className={`h-8 rounded-lg border px-3 text-xs transition-colors ${estrellas === null ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
        >
          Todas · {formatNumero(total)}
        </button>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar en las reseñas (en español o en su idioma)"
          className="h-8 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-ink-950/60 px-3 text-sm text-ink-100 placeholder:text-ink-500 focus:border-accent-500/60 focus:outline-none"
        />
      </div>

      <p className="text-xs text-ink-400">
        {formatNumero(lista.length)} {lista.length === 1 ? "reseña" : "reseñas"}
        {estrellas !== null ? ` de ${estrellas} ★` : ""}
        {texto ? ` con «${busqueda.trim()}»` : ""}
      </p>

      {lista.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-400">No hay reseñas con este filtro.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-white/[0.05]">
          {lista.slice(0, visibles).map((r, i) => (
            <Resena key={`${r.autor}|${r.fecha}|${i}`} r={r} />
          ))}
        </ul>
      )}

      {lista.length > visibles && (
        <div className="flex justify-center gap-2 border-t border-white/[0.06] pt-3">
          <button onClick={() => setVisibles(visibles + POR_PAGINA)} className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-ink-200 hover:bg-white/[0.06]">
            Ver {Math.min(POR_PAGINA, lista.length - visibles)} más
          </button>
          <button onClick={() => setVisibles(lista.length)} className="rounded-lg px-3 py-1.5 text-xs text-accent-300 hover:bg-white/[0.06]">
            Ver todas ({formatNumero(lista.length)})
          </button>
        </div>
      )}
    </div>
  );
}
