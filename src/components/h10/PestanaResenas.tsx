"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CodigoPais, EstudioH10, ResenasCompetidorH10 } from "@/lib/datos/h10Tipos";
import Link from "next/link";
import { analizarResenas, EUR_POR_GBP, nombrePais, type TemaResenas } from "@/lib/datos/h10Analisis";
import { formatNumero } from "@/lib/format";
import { Pais, Tarjeta } from "./comun";
import { QuejasEstrellas } from "./QuejasEstrellas";

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
export function FilaTema({ t }: { t: TemaResenas }) {
  const queja = t.tipo === "queja";
  return (
    <li className="rounded-lg border border-white/[0.06] bg-ink-950/40 p-3">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block font-medium text-ink-100">{t.texto}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
              <span className={`rounded px-1.5 py-0.5 font-semibold ${queja ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`} title={queja ? "Reseñas que se quejan de esto" : "Reseñas que lo valoran"}>
                {t.menciones} {t.menciones === 1 ? "reseña" : "reseñas"}
              </span>
              <span>
                en {t.productos} {t.productos === 1 ? "producto" : "productos"}
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

/** Reviews each competitor has on Amazon (its Xray row in that country), or null when the Xray doesn't list it. */
function resenasEnAmazon(estudio: EstudioH10, c: ResenasCompetidorH10): number | null {
  if (!c.asin) return null;
  return estudio.mercados.find((m) => m.codigoPais === c.codigoPais)?.competidores.find((x) => x.asin === c.asin)?.resenas ?? null;
}

/** Topic mentions Helium 10 counted in a competitor's reviews (praise and complaints). */
const menciones = (c: ResenasCompetidorH10) => [...c.positivos, ...c.negativos].reduce((t, x) => t + x.menciones, 0);

/** «Mejoras para tu producto» is hidden for now (it comes back later); true shows it again. */
const CON_MEJORAS = false;

/**
 * The 10 strongest competitors (by revenue, in euros) of the country shown, or of every country: their rating and
 * reviews, and a link to their own page with every review.
 */
function MasFuertes({ estudio, pais }: { estudio: EstudioH10; pais: CodigoPais | null }) {
  const filas = estudio.mercados
    .filter((m) => !pais || m.codigoPais === pais)
    .flatMap((m) => m.competidores.map((c) => ({ m, c, eur: m.moneda === "GBP" ? c.facturacion * EUR_POR_GBP : c.facturacion })))
    .sort((a, b) => b.eur - a.eur)
    .slice(0, 10);
  if (!filas.length) return null;
  const cargadas = (p: string, asin: string | null | undefined) => estudio.resenasCompletas?.find((r) => r.codigoPais === p && r.asin === asin);
  return (
    <Tarjeta titulo={`Los 10 competidores más fuertes ${pais ? `en ${nombrePais(pais)}` : "del nicho"}`} subtitulo="Los que más facturan · toca uno para ver todo su detalle y todas sus reseñas">
      <div className="-mx-4 mt-2 overflow-x-auto px-4">
        <table className="tabular w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] text-left text-xs text-ink-400">
              <th className="px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Producto</th>
              <th className="px-2 py-2 font-medium">País</th>
              <th className="px-2 py-2 text-right font-medium">Valoración</th>
              <th className="px-2 py-2 text-right font-medium">Reseñas</th>
              <th className="px-2 py-2 text-right font-medium">Facturación/mes</th>
              <th className="px-2 py-2 text-right font-medium">Reseñas cargadas</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {filas.map(({ m, c, eur }, i) => {
              const r = cargadas(m.codigoPais, c.asin);
              const enlace = c.asin ? `/analisis-h10/${estudio.id}/competidor/${m.codigoPais}/${c.asin}` : null;
              return (
                <tr key={`${m.codigoPais}-${c.asin ?? c.puesto}-${i}`} className="border-b border-white/[0.05] hover:bg-white/[0.03]">
                  <td className="px-2 py-2.5 text-ink-500">{i + 1}</td>
                  <td className="max-w-80 px-2 py-2.5">
                    {enlace ? (
                      <Link href={enlace} className="block truncate font-medium text-ink-100 hover:text-accent-300 hover:underline" title={c.titulo}>
                        {c.marca}
                      </Link>
                    ) : (
                      <span className="block truncate font-medium text-ink-100">{c.marca}</span>
                    )}
                    <span className="block truncate text-xs text-ink-500" title={c.titulo}>
                      {c.titulo}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <Pais codigo={m.codigoPais} corto />
                  </td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap">
                    {c.valoracion ? (
                      <span className={c.valoracion >= 4.5 ? "text-success" : c.valoracion < 4 ? "text-danger" : "text-ink-100"}>
                        <span className="text-accent-400">★</span> {c.valoracion.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </span>
                    ) : (
                      <span className="text-ink-600">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right font-medium text-ink-100">{formatNumero(c.resenas)}</td>
                  <td className="px-2 py-2.5 text-right">{formatNumero(Math.round(eur))} €</td>
                  <td className="px-2 py-2.5 text-right">{r ? <span className="text-success">{formatNumero(r.total)}</span> : <span className="text-ink-600">—</span>}</td>
                  <td className="px-2 py-2.5 text-right">
                    {enlace && (
                      <Link href={enlace} className="text-xs font-medium whitespace-nowrap text-accent-300 hover:text-accent-400">
                        Ver detalle →
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}

/** «Reseñas»: what the competitors' customers complain about and praise (Helium 10's «Review Analysis»), and what to do about it. */
export function PestanaResenas({ estudio }: { estudio: EstudioH10 }) {
  /** Country shown (null: every country together). */
  const [pais, setPais] = useState<CodigoPais | null>(null);
  const todo = analizarResenas(estudio);
  if (!todo) return null;
  const a = (pais && analizarResenas({ ...estudio, resenasH10: (estudio.resenasH10 ?? []).filter((c) => c.codigoPais === pais) })) || todo;
  const paises = [...new Set(todo.competidores.map((c) => c.codigoPais))];
  const mejoras = a.quejas.filter((q) => q.mejora);
  const fecha = estudio.resenasAgrupadas ? new Date(estudio.resenasAgrupadas.generadoEn).toLocaleDateString("es-ES") : null;
  const enAmazon = (lista: ResenasCompetidorH10[]) => lista.reduce((t, c) => t + (resenasEnAmazon(estudio, c) ?? 0), 0);
  const analizadas = (lista: ResenasCompetidorH10[]) => lista.reduce((t, c) => t + menciones(c), 0);
  // Competitors with every review uploaded, in the country shown.
  const completas = (estudio.resenasCompletas ?? []).filter((r) => !pais || r.codigoPais === pais);
  const donde = pais ? `en ${nombrePais(pais)}` : "en todos los países";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-ink-900/80 p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-ink-300">
          {todo.agrupado ? (
            <>
              La IA juntó los temas de los {todo.competidores.length} competidores (en todos los idiomas) en temas comunes en español
              {fecha ? `, el ${fecha}` : ""}.
              {todo.sinAgrupar > 0 && (
                <strong className="text-warning">
                  {" "}
                  Hay {todo.sinAgrupar} {todo.sinAgrupar === 1 ? "archivo nuevo" : "archivos nuevos"} sin agrupar: vuelve a analizar.
                </strong>
              )}
            </>
          ) : (
            <>Ahora ves los temas tal como los da Helium 10, en el idioma de cada país. Con «Analizar con IA» se juntan en temas comunes en español y cada queja trae una mejora para tu producto.</>
          )}
        </p>
        <BotonAnalizar estudioId={estudio.id} texto={todo.agrupado ? "Volver a analizar" : "Analizar con IA"} />
      </div>

      {/* Country picker: everything below shows that country only. */}
      <div className="flex flex-wrap gap-1.5">
        {[null, ...paises].map((p) => {
          const n = p ? todo.competidores.filter((c) => c.codigoPais === p).length : todo.competidores.length;
          return (
            <button
              key={p ?? "todos"}
              onClick={() => setPais(p)}
              aria-pressed={pais === p}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${pais === p ? "border-accent-500/60 bg-accent-500/10 font-medium text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
            >
              {p ? <Pais codigo={p} /> : "Todos los países"}
              <span className="tabular text-xs text-ink-500">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { t: "Competidores", v: String(a.competidores.length), s: pais ? nombrePais(pais) : `en ${paises.length} ${paises.length === 1 ? "país" : "países"}` },
          { t: "Reseñas en Amazon", v: formatNumero(enAmazon(a.competidores)), s: `H10 analizó ${formatNumero(analizadas(a.competidores))} menciones` },
          { t: "Quejas distintas", v: String(a.quejas.length), s: `${a.elogios.length} elogios distintos` },
          { t: "Queja más repetida", v: a.quejas[0] ? `${a.quejas[0].productos} prod.` : "—", s: a.quejas[0]?.texto ?? "ninguna" },
          { t: "Lo más valorado", v: a.elogios[0] ? `${a.elogios[0].productos} prod.` : "—", s: a.elogios[0]?.texto ?? "" },
        ].map((x) => (
          <div key={x.t} className="rounded-xl border border-white/[0.06] bg-ink-900/80 p-4 shadow-soft">
            <p className="text-[13px] font-medium text-ink-200">{x.t}</p>
            <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink-100">{x.v}</p>
            <p className="mt-1 truncate text-xs text-ink-400" title={x.s}>
              {x.s}
            </p>
          </div>
        ))}
      </div>

      {CON_MEJORAS && mejoras.length > 0 && (
        <Tarjeta titulo={`Mejoras para tu producto ${donde}`} subtitulo="Cada queja de la competencia, convertida en algo que tu producto puede hacer mejor (las más repetidas primero)">
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

      <MasFuertes estudio={estudio} pais={pais} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo={`De qué se quejan ${donde}`} subtitulo="Ordenadas por en cuántos productos aparecen · toca una para ver ejemplos">
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
        <Tarjeta titulo={`Qué valoran ${donde}`} subtitulo="Lo que tu producto también tiene que cumplir">
          <ul className="mt-3 flex flex-col gap-2">
            {a.elogios.map((t) => (
              <FilaTema key={t.texto} t={t} />
            ))}
          </ul>
        </Tarjeta>
      </div>

      <Tarjeta
        titulo={`Qué dicen en cada estrella ${donde}`}
        subtitulo={`Las reseñas de ${completas.length === 1 ? "1 competidor" : `${completas.length} competidores`}, nota por nota de 1 a 5 estrellas: de qué se quejan y qué les gusta, y cuántas lo dicen`}
      >
        {completas.length > 0 ? (
          <QuejasEstrellas
            key={pais ?? "TODOS"}
            estudioId={estudio.id}
            objetivo={{ ambito: pais ?? "TODOS" }}
            datos={estudio.estrellasAmbito?.[pais ?? "TODOS"] ?? null}
            total={completas.reduce((t, r) => t + r.total, 0)}
          />
        ) : (
        <p className="mt-3 rounded-lg border border-dashed border-white/[0.12] px-4 py-5 text-center text-sm text-ink-400">
          Los Excel de «Review Analysis» no dicen cuántas estrellas tiene cada reseña. Para verlo, sube en «Datos» el CSV del <strong className="text-ink-200">Review Downloader</strong> de Helium 10 (extensión de
          Chrome, en la página del producto en Amazon), uno por competidor.
        </p>
        )}
      </Tarjeta>

      <p className="text-xs text-ink-500">
        «Reseñas en Amazon» son las que tiene cada producto según su Xray; «menciones analizadas», las que Helium 10 resumió en su «Review Analysis» (solo unas pocas por producto). Tómalo como pistas de qué
        mejorar, no como estadística; por eso las reseñas apenas cuentan en la nota (+0,5 como mucho, si una queja se repite en 3 productos o más).
      </p>
    </div>
  );
}
