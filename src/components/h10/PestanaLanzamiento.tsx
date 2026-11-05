"use client";

import { useEffect, useRef, useState } from "react";
import type { CodigoPais, PalabraClave, PalabraLanzamiento, PalabrasMercado } from "@/lib/datos/h10Tipos";
import { formatNumero } from "@/lib/format";
import { Pais } from "./comun";

/** How long after the last key a note is saved. */
const ESPERA_TEXTO_MS = 800;
/** CPR is sales in 8 days: what that means a day («≈4,9/día»). */
const alDia = (cpr: number) =>
  (cpr / 8).toLocaleString("es-ES", {
    maximumFractionDigits: cpr / 8 < 10 ? 1 : 0,
  });
export const clavePalabra = (pais: string, texto: string) => `${pais}|${texto}`;

/**
 * The keywords taken to «Lanzamiento», shared by «Palabras clave» (where they're picked) and «Lanzamiento» (where
 * they're put in order): the list and the actions, each saved with the study.
 */
export function usePalabrasLanzamiento(estudioId: string, inicial: PalabraLanzamiento[]) {
  const [lista, setLista] = useState(inicial);
  const [estado, setEstado] = useState<"guardado" | "guardando" | "error">("guardado");
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cola = useRef<Promise<void>>(Promise.resolve());
  const pendiente = useRef<PalabraLanzamiento[] | null>(null);

  const guardar = (nueva: PalabraLanzamiento[]) => {
    setEstado("guardando");
    cola.current = cola.current.then(async () => {
      const r = await fetch(`/api/h10/estudios/${estudioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ palabrasLanzamiento: nueva }),
      }).catch(() => null);
      setEstado(r?.ok ? "guardado" : "error");
    });
  };
  /** Changes the list and saves it: right away, or a moment after you stop typing a note. */
  const cambiar = (nueva: PalabraLanzamiento[], tecleando = false) => {
    setLista(nueva);
    pendiente.current = nueva;
    if (espera.current) clearTimeout(espera.current);
    if (tecleando) espera.current = setTimeout(() => guardar(nueva), ESPERA_TEXTO_MS);
    else guardar(nueva);
  };
  // Leaving with a note still waiting: saved anyway.
  useEffect(
    () => () => {
      if (espera.current && pendiente.current) {
        clearTimeout(espera.current);
        void fetch(`/api/h10/estudios/${estudioId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ palabrasLanzamiento: pendiente.current }),
          keepalive: true,
        });
      }
    },
    [estudioId],
  );

  const elegidas = new Set(lista.map((p) => clavePalabra(p.pais, p.texto)));
  return {
    lista,
    estado,
    elegidas,
    /** Adds a keyword at the end, or takes it out if it was already there. */
    alternar: (pais: CodigoPais, p: PalabraClave) =>
      elegidas.has(clavePalabra(pais, p.texto))
        ? cambiar(lista.filter((x) => clavePalabra(x.pais, x.texto) !== clavePalabra(pais, p.texto)))
        : cambiar([
            ...lista,
            {
              pais,
              texto: p.texto,
              nota: "",
              busquedas: p.busquedas,
              cpr: p.cpr,
              densidadTitulos: p.densidadTitulos,
            },
          ]),
    /** Swaps a keyword with the one before or after it of the same country (each country has its own order). */
    mover: (i: number, paso: -1 | 1) => {
      let j = i + paso;
      while (j >= 0 && j < lista.length && lista[j].pais !== lista[i].pais) j += paso;
      if (j < 0 || j >= lista.length) return;
      const nueva = [...lista];
      [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
      cambiar(nueva);
    },
    quitar: (i: number) => cambiar(lista.filter((_, n) => n !== i)),
    nota: (i: number, texto: string) =>
      cambiar(
        lista.map((x, n) => (n === i ? { ...x, nota: texto } : x)),
        true,
      ),
  };
}
export type PalabrasLanzamiento = ReturnType<typeof usePalabrasLanzamiento>;

const flecha =
  "flex size-7 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-white/[0.06] hover:text-ink-100 disabled:opacity-30 disabled:hover:bg-transparent";

/**
 * «Lanzamiento»: the keywords chosen in «Palabras clave», in the order of the launch strategy, with their key figures
 * (searches, CPR and what it means a day, title density) and a note each. The figures are today's when the keyword is
 * still in the study's data, else the ones it had when chosen.
 */
export function PestanaLanzamiento({ l, palabras }: { l: PalabrasLanzamiento; palabras: Record<string, PalabrasMercado> }) {
  const actual = (p: PalabraLanzamiento) => palabras[p.pais]?.palabras.find((x) => x.texto === p.texto);
  const busquedasDe = (p: PalabraLanzamiento) => actual(p)?.busquedas ?? p.busquedas;
  // One country at a time: every country with keywords in the study, plus any that only has chosen ones. It opens on
  // the first one with chosen keywords.
  const paises = [...new Set([...l.lista.map((p) => p.pais), ...(Object.keys(palabras) as CodigoPais[])])];
  const [elegido, setElegido] = useState<CodigoPais | null>(null);
  const pais = elegido && paises.includes(elegido) ? elegido : (l.lista[0]?.pais ?? paises[0] ?? null);
  return (
    <div className="flex flex-col gap-4">
      {/* Country filter */}
      {paises.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {paises.map((p) => (
            <button
              key={p}
              onClick={() => setElegido(p)}
              aria-pressed={p === pais}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${p === pais ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
            >
              <Pais codigo={p} /> <span className="text-ink-500">{l.lista.filter((x) => x.pais === p).length}</span>
            </button>
          ))}
        </div>
      )}

      <div>
        {/* «LANZAMIENTO» and the chosen country, big and white */}
        <h2 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          LANZAMIENTO
          {pais && (
            <span className="inline-flex items-center gap-2 text-2xl sm:text-3xl">
              <span className="text-ink-500">·</span>
              <Pais codigo={pais} />
            </span>
          )}
        </h2>
        <p className="mt-1 text-xs text-ink-400">
          Las palabras clave de tu estrategia, en el orden en que las vas a trabajar. Elígelas en «Palabras clave» con el botón ＋.
          <span className={`ml-2 ${l.estado === "error" ? "text-danger" : "text-ink-500"}`}>
            {l.estado === "guardando" ? "· Guardando…" : l.estado === "error" ? "· No se pudo guardar: revisa la conexión" : l.lista.length ? "· Guardado" : ""}
          </span>
        </p>
      </div>

      {l.lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/[0.12] px-4 py-12 text-center text-sm text-ink-400">
          <p className="max-w-md">
            Aún no hay palabras. Ve a «Palabras clave» y pulsa ＋ en las que quieras para tu lanzamiento: aparecerán aquí para ordenarlas.
          </p>
        </div>
      ) : (
        <>
          {[pais].map((pais) => {
            const delPais = l.lista.map((p, i) => ({ p, i })).filter((x) => x.p.pais === pais);
            if (!delPais.length)
              return (
                <p key="vacio" className="rounded-xl border border-dashed border-white/[0.12] px-4 py-10 text-center text-sm text-ink-400">
                  Aún no hay palabras de este país. Ve a «Palabras clave», elige este país y pulsa ＋ en las que quieras.
                </p>
              );
            return (
              <section key={pais} className="flex flex-col gap-2">
                <p className="border-b border-white/[0.06] pb-2 text-xs text-ink-500">
                  {delPais.length} {delPais.length === 1 ? "palabra" : "palabras"} · {formatNumero(delPais.reduce((s, x) => s + busquedasDe(x.p), 0))} búsquedas al mes
                </p>
                <ol className="flex flex-col gap-2">
                  {delPais.map(({ p, i }, n) => {
                    const primera = n === 0;
                    const ultima = n === delPais.length - 1;
                    const a = actual(p);
                    const busquedas = a?.busquedas ?? p.busquedas;
                    const cpr = a ? a.cpr : p.cpr;
                    const densidad = a ? a.densidadTitulos : p.densidadTitulos;
                    return (
                      <li
                        key={clavePalabra(p.pais, p.texto)}
                        className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-ink-900/80 p-3 md:flex-row md:items-start"
                      >
                        <div className="flex shrink-0 items-center gap-1 md:flex-col">
                          <span className="flex size-7 items-center justify-center rounded-full bg-accent-500/15 text-xs font-semibold text-accent-300">
                            {n + 1}
                          </span>
                          <button onClick={() => l.mover(i, -1)} disabled={primera} className={flecha} aria-label="Subir">
                            ↑
                          </button>
                          <button onClick={() => l.mover(i, 1)} disabled={ultima} className={flecha} aria-label="Bajar">
                            ↓
                          </button>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-sm font-semibold text-ink-100">{p.texto}</span>
                            {!a && (
                              <span
                                className="text-[11px] text-warning"
                                title="Ya no está en el Cerebro del estudio: se muestran los datos que tenía al elegirla"
                              >
                                datos de cuando la elegiste
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-xs">
                            <span className="rounded-md bg-success/10 px-2 py-0.5 text-success">
                              <strong>{formatNumero(busquedas)}</strong> búsquedas
                            </span>
                            <span className="rounded-md bg-success/10 px-2 py-0.5 text-success" title="Ventas en 8 días para llegar a la página 1">
                              CPR <strong>{cpr ?? "—"}</strong>
                              {cpr !== null && <span className="text-ink-400"> ≈{alDia(cpr)}/día</span>}
                            </span>
                            <span
                              className="rounded-md bg-success/10 px-2 py-0.5 text-success"
                              title="Cuántos de los primeros productos la llevan en el título"
                            >
                              <strong>{densidad ?? "—"}</strong> en títulos
                            </span>
                          </div>
                          <textarea
                            value={p.nota}
                            onChange={(e) => l.nota(i, e.target.value)}
                            maxLength={1000}
                            rows={2}
                            placeholder="Estrategia para esta palabra (título, PPC, semana en que atacarla…)"
                            className="w-full resize-y rounded-lg border border-white/[0.06] bg-ink-950/50 px-3 py-2 text-sm leading-relaxed text-ink-100 placeholder:text-ink-600 focus:border-accent-500/60 focus:outline-none"
                          />
                        </div>
                        <button
                          onClick={() => l.quitar(i)}
                          className="self-start rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-white/[0.06] hover:text-danger"
                          title="Quitar de Lanzamiento"
                        >
                          ✕ Quitar
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
