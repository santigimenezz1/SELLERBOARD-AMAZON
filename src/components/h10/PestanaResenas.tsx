"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EstudioH10 } from "@/lib/datos/h10Tipos";
import { analizarResenas, type TemaResenas } from "@/lib/datos/h10Analisis";
import { Pais, Tarjeta } from "./comun";

const AMAZON: Record<string, string> = { ES: "amazon.es", DE: "amazon.de", FR: "amazon.fr", IT: "amazon.it", GB: "amazon.co.uk" };

const estrellas = (v: number) => `${v > 0 ? "+" : "−"}${Math.abs(v).toLocaleString("es-ES", { maximumFractionDigits: 2 })} ★`;

/** «Analizar con IA»: groups every competitor's topics into common themes in Spanish, with an improvement per complaint. */
function BotonAnalizar({ estudioId, texto }: { estudioId: string; texto: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-start gap-1">
      <button
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true);
          setError(null);
          try {
            const r = await fetch(`/api/h10/estudios/${estudioId}/resenas`, { method: "POST" });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error ?? "No se pudo analizar");
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo analizar");
          } finally {
            setOcupado(false);
          }
        }}
        className="rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-60"
      >
        {ocupado ? "Analizando… (≈ 30 s)" : texto}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

/** One theme: how many products and countries mention it, its effect on the rating, and the reviews' own words. */
function FilaTema({ t }: { t: TemaResenas }) {
  const queja = t.tipo === "queja";
  return (
    <li className="rounded-lg border border-white/[0.06] bg-ink-950/40 p-3">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block font-medium text-ink-100">{t.texto}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
              <span className={`rounded px-1.5 py-0.5 font-medium ${queja ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}>
                {t.productos} {t.productos === 1 ? "producto" : "productos"}
              </span>
              <span>
                {t.menciones} {t.menciones === 1 ? "mención" : "menciones"}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {t.paises.map((p) => (
                  <Pais key={p} codigo={p} corto />
                ))}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
            {t.impacto !== null && (
              <span className={t.impacto < 0 ? "text-danger" : "text-success"} title="Cuánto sube o baja la valoración de esos productos, según Helium 10">
                {estrellas(t.impacto)}
              </span>
            )}
            <span className="text-ink-500 group-open:hidden">ver más ▾</span>
            <span className="hidden text-ink-500 group-open:inline">ocultar ▴</span>
          </span>
        </summary>
        <div className="mt-2 flex flex-col gap-2 border-t border-white/[0.05] pt-2 text-xs">
          {queja && t.mejora && (
            <p className="text-ink-200">
              <span className="font-medium text-accent-300">Tu producto: </span>
              {t.mejora}
            </p>
          )}
          <p className="text-ink-400">Marcas: {t.marcas.join(", ")}</p>
          {t.ejemplos.length > 0 && (
            <ul className="flex flex-col gap-1">
              {t.ejemplos.slice(0, 6).map((e, i) => (
                <li key={i} className="text-ink-300">
                  «{e.texto}» <span className="text-ink-500">— {e.marca}, {e.pais}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-ink-500">En Helium 10: {t.originales.join(" · ")}</p>
        </div>
      </details>
    </li>
  );
}

/** «Reseñas»: what the competitors' customers complain about and praise (Helium 10's «Review Analysis»), and what to do about it. */
export function PestanaResenas({ estudio }: { estudio: EstudioH10 }) {
  const a = analizarResenas(estudio);
  if (!a) return null;
  const paises = [...new Set(a.competidores.map((c) => c.codigoPais))];
  const mejoras = a.quejas.filter((q) => q.mejora);
  const fecha = estudio.resenasAgrupadas ? new Date(estudio.resenasAgrupadas.generadoEn).toLocaleDateString("es-ES") : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-ink-900/80 p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-ink-300">
          {a.agrupado ? (
            <>
              La IA juntó los temas de los {a.competidores.length} competidores (en todos los idiomas) en temas comunes en español
              {fecha ? `, el ${fecha}` : ""}.
              {a.sinAgrupar > 0 && (
                <strong className="text-warning">
                  {" "}
                  Hay {a.sinAgrupar} {a.sinAgrupar === 1 ? "archivo nuevo" : "archivos nuevos"} sin agrupar: vuelve a analizar.
                </strong>
              )}
            </>
          ) : (
            <>Ahora ves los temas tal como los da Helium 10, en el idioma de cada país. Con «Analizar con IA» se juntan en temas comunes en español y cada queja trae una mejora para tu producto.</>
          )}
        </p>
        <BotonAnalizar estudioId={estudio.id} texto={a.agrupado ? "Volver a analizar" : "Analizar con IA"} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { t: "Competidores", v: String(a.competidores.length), s: `en ${paises.length} ${paises.length === 1 ? "país" : "países"}` },
          { t: "Quejas distintas", v: String(a.quejas.length), s: `${a.elogios.length} elogios distintos` },
          { t: "Queja más repetida", v: a.quejas[0] ? `${a.quejas[0].productos} prod.` : "—", s: a.quejas[0]?.texto ?? "ninguna" },
          { t: "Lo más valorado", v: a.elogios[0] ? `${a.elogios[0].productos} prod.` : "—", s: a.elogios[0]?.texto ?? "" },
        ].map((x) => (
          <div key={x.t} className="rounded-xl border border-white/[0.06] bg-ink-900/80 p-4 shadow-soft">
            <p className="text-xs text-ink-400">{x.t}</p>
            <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink-100">{x.v}</p>
            <p className="mt-1 truncate text-xs text-ink-400" title={x.s}>
              {x.s}
            </p>
          </div>
        ))}
      </div>

      {mejoras.length > 0 && (
        <Tarjeta titulo="Mejoras para tu producto" subtitulo="Cada queja de la competencia, convertida en algo que tu producto puede hacer mejor (las más repetidas primero)">
          <ol className="mt-3 flex flex-col gap-2.5">
            {mejoras.map((q, i) => (
              <li key={q.texto} className="flex gap-3 rounded-lg border border-white/[0.06] bg-ink-950/40 p-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-xs font-semibold text-accent-300">{i + 1}</span>
                <span className="min-w-0 text-sm">
                  <span className="font-medium text-ink-100">{q.mejora}</span>
                  <span className="mt-0.5 block text-xs text-ink-400">
                    Porque se quejan de «{q.texto.toLowerCase()}» en {q.productos} {q.productos === 1 ? "producto" : "productos"} ({q.marcas.join(", ")}).
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Tarjeta>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="De qué se quejan" subtitulo="Ordenadas por en cuántos productos aparecen · toca una para ver ejemplos">
          {a.quejas.length ? (
            <ul className="mt-3 flex flex-col gap-2">
              {a.quejas.map((t) => (
                <FilaTema key={t.texto} t={t} />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-400">Helium 10 no encontró quejas en estos productos.</p>
          )}
        </Tarjeta>
        <Tarjeta titulo="Qué valoran" subtitulo="Lo que tu producto también tiene que cumplir">
          <ul className="mt-3 flex flex-col gap-2">
            {a.elogios.map((t) => (
              <FilaTema key={t.texto} t={t} />
            ))}
          </ul>
        </Tarjeta>
      </div>

      <Tarjeta titulo="Competidores analizados" subtitulo="Un «Review Analysis» de Helium 10 por producto">
        <div className="-mx-4 mt-2 overflow-x-auto px-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-left text-xs text-ink-400">
                <th className="px-2 py-2 font-medium">Marca</th>
                <th className="px-2 py-2 font-medium">País</th>
                <th className="px-2 py-2 font-medium">Queja principal</th>
                <th className="px-2 py-2 font-medium">Lo que más gusta</th>
              </tr>
            </thead>
            <tbody>
              {a.competidores.map((c) => (
                <tr key={c.archivoId} className="border-b border-white/[0.05] align-top">
                  <td className="px-2 py-2">
                    <span className="font-medium text-ink-100">{c.marca ?? "—"}</span>
                    {c.asin && (
                      <a href={`https://www.${AMAZON[c.codigoPais] ?? "amazon.es"}/dp/${c.asin}`} target="_blank" rel="noreferrer" className="block text-xs text-ink-500 hover:text-accent-300" title={c.producto ?? undefined}>
                        {c.asin} ↗
                      </a>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <Pais codigo={c.codigoPais} corto />
                  </td>
                  <td className={`px-2 py-2 ${c.quejaPrincipal ? "text-ink-200" : "text-ink-500"}`}>{c.quejaPrincipal ?? "ninguna"}</td>
                  <td className="px-2 py-2 text-ink-300">{c.elogioPrincipal ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <p className="text-xs text-ink-500">
        Ojo: Helium 10 resume solo unas pocas reseñas de cada producto (casi todos los temas tienen 1–4 menciones). Tómalo como pistas de qué mejorar, no como estadística; por eso las
        reseñas apenas cuentan en la nota (+0,5 como mucho, si una queja se repite en 3 productos o más).
      </p>
    </div>
  );
}
