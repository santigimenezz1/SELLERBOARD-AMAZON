"use client";

import { useEffect, useRef, useState } from "react";
import type { MejoraProducto } from "@/lib/datos/h10Tipos";

/** How long after the last key a text is saved. */
const ESPERA_TEXTO_MS = 800;

const nuevoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `m${Date.now()}${Math.random().toString(36).slice(2, 8)}`);

/**
 * «Mejoras de producto»: cards with an editable text, ticked in green once that improvement is done. The whole list is
 * saved with the study (a tick, a new card or a deletion at once; a text a moment after you stop typing).
 */
export function PestanaMejoras({ estudioId, inicial }: { estudioId: string; inicial: MejoraProducto[] }) {
  const [mejoras, setMejoras] = useState<MejoraProducto[]>(inicial);
  const [estado, setEstado] = useState<"guardado" | "guardando" | "error">("guardado");
  const [error, setError] = useState<string | null>(null);
  /** The card just added, to put the cursor in it. */
  const [enfocar, setEnfocar] = useState<string | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Saves one after another, so an older list never lands after a newer one. */
  const cola = useRef<Promise<void>>(Promise.resolve());
  /** The latest list, for a text still waiting to be saved when the tab closes. */
  const pendiente = useRef<MejoraProducto[] | null>(null);

  const guardar = (lista: MejoraProducto[]) => {
    setEstado("guardando");
    cola.current = cola.current.then(async () => {
      const r = await fetch(`/api/h10/estudios/${estudioId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mejoras: lista }) }).catch(() => null);
      const b = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
      if (r?.ok) {
        setEstado("guardado");
        setError(null);
      } else {
        setEstado("error");
        setError(b?.error ?? "No se pudo guardar: revisa la conexión");
      }
    });
  };

  /** Changes the list and saves it: right away, or after a pause while typing. */
  const cambiar = (lista: MejoraProducto[], tecleando = false) => {
    setMejoras(lista);
    pendiente.current = lista;
    if (espera.current) clearTimeout(espera.current);
    if (tecleando) espera.current = setTimeout(() => guardar(lista), ESPERA_TEXTO_MS);
    else guardar(lista);
  };

  // Leaving the tab with a text still waiting: saved anyway.
  useEffect(
    () => () => {
      if (espera.current && pendiente.current) {
        clearTimeout(espera.current);
        void fetch(`/api/h10/estudios/${estudioId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mejoras: pendiente.current }), keepalive: true });
      }
    },
    [estudioId],
  );

  const anadir = () => {
    const id = nuevoId();
    setEnfocar(id);
    cambiar([...mejoras, { id, texto: "", hecha: false }]);
  };
  const hechas = mejoras.filter((m) => m.hecha).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink-100">Mejoras de producto</h2>
          <p className="mt-0.5 text-xs text-ink-400">
            {mejoras.length ? `${hechas} de ${mejoras.length} ${mejoras.length === 1 ? "mejora hecha" : "mejoras hechas"}` : "Apunta lo que quieres mejorar del producto y márcalo en verde cuando esté hecho."}
            <span className={`ml-2 ${estado === "error" ? "text-danger" : "text-ink-500"}`}>{estado === "guardando" ? "· Guardando…" : estado === "error" ? `· ${error}` : mejoras.length ? "· Guardado" : ""}</span>
          </p>
        </div>
        <button onClick={anadir} className="rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-medium text-ink-950 hover:bg-accent-400">
          + Añadir mejora
        </button>
      </div>

      {mejoras.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/[0.12] px-4 py-12 text-center text-sm text-ink-400">
          <p className="max-w-md">Aún no hay mejoras. Pulsa «Añadir mejora» para crear la primera tarjeta.</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {mejoras.map((m, i) => (
            <li
              key={m.id}
              className={`flex min-w-0 flex-col gap-2 rounded-xl border p-3 shadow-soft transition-colors ${m.hecha ? "border-success/40 bg-success/[0.06]" : "border-danger/40 bg-danger/[0.06]"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold ${m.hecha ? "text-success" : "text-danger"}`}>
                  Mejora {i + 1}
                  {m.hecha ? " · hecha" : " · pendiente"}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => cambiar(mejoras.map((x) => (x.id === m.id ? { ...x, hecha: !x.hecha } : x)))}
                    aria-pressed={m.hecha}
                    title={m.hecha ? "Marcar como pendiente" : "Marcar como hecha"}
                    className={`flex size-7 items-center justify-center rounded-full border transition-colors ${m.hecha ? "border-success bg-success text-ink-950" : "border-danger/50 text-danger/70 hover:border-success hover:text-success"}`}
                  >
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => (m.texto.trim() === "" || confirm("¿Borrar esta mejora?")) && cambiar(mejoras.filter((x) => x.id !== m.id))}
                    title="Borrar"
                    aria-label="Borrar mejora"
                    className="flex size-7 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-white/[0.06] hover:text-danger"
                  >
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              </div>
              <textarea
                value={m.texto}
                autoFocus={enfocar === m.id}
                onChange={(e) => cambiar(mejoras.map((x) => (x.id === m.id ? { ...x, texto: e.target.value } : x)), true)}
                maxLength={2000}
                rows={4}
                placeholder="Describe la mejora: qué cambiar, por qué y cómo…"
                className={`min-h-24 w-full resize-y rounded-lg border border-white/[0.06] bg-ink-950/50 px-3 py-2 text-sm leading-relaxed placeholder:text-ink-600 focus:border-accent-500/60 focus:outline-none ${m.hecha ? "text-ink-300" : "text-ink-100"}`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
