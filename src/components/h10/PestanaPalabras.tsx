"use client";

import { useState } from "react";
import type { EstudioH10, PalabrasMercado } from "@/lib/datos/h10Tipos";
import { clasificarPalabra, nombrePais, palabrasParaTitulo, posicionesDeRivales, type ClasePalabra } from "@/lib/datos/h10Analisis";
import { formatMoneda, formatNumero } from "@/lib/format";
import { Barras, Pais, Tarjeta } from "./comun";

const CLASES: Record<ClasePalabra, { texto: string; clase: string; ayuda: string }> = {
  imprescindible: { texto: "Imprescindible", clase: "bg-success/15 text-success", ayuda: "Muchas búsquedas y los líderes ya la llevan en el título: tiene que estar en el tuyo." },
  oportunidad: { texto: "Oportunidad", clase: "bg-serie-ventas/20 text-ink-100", ayuda: "Bastantes búsquedas pero pocos títulos la usan: más fácil posicionarse." },
  secundaria: { texto: "Secundaria", clase: "bg-white/[0.06] text-ink-300", ayuda: "Para las viñetas, la descripción o las palabras clave ocultas." },
  sinDatos: { texto: "Sin datos", clase: "bg-warning/15 text-warning", ayuda: "Helium 10 no da búsquedas para ella: no se puede valorar." },
};

/** Organic rank as a chip: top 10 stands out, beyond that muted, absent as a dash. */
function Posicion({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-ink-600">—</span>;
  return <span className={valor <= 3 ? "font-semibold text-success" : valor <= 10 ? "text-ink-100" : "text-ink-400"}>#{valor}</span>;
}

/** «Palabras clave»: what people search in each country, which words the title needs and where each competitor ranks. */
/** `inicial`: the country shown first (the study’s best one). */
export function PestanaPalabras({ estudio, palabras, inicial, ejemplo }: { estudio: EstudioH10; palabras: Record<string, PalabrasMercado>; inicial: string; ejemplo: boolean }) {
  const paises = [...new Set([...estudio.mercados.map((m) => m.codigoPais as string), ...Object.keys(palabras)])].filter((p) => palabras[p]);
  const [pais, setPais] = useState(paises.find((p) => p === inicial) ?? paises[0]);
  const datos = palabras[pais];
  if (!datos) return null;
  const moneda = estudio.mercados.find((m) => m.codigoPais === pais)?.moneda ?? "EUR";
  const max = Math.max(...datos.palabras.map((p) => p.busquedas));
  const lista = [...datos.palabras].sort((a, b) => b.busquedas - a.busquedas);
  const clases = lista.map((p) => clasificarPalabra(p, max));
  const titulo = palabrasParaTitulo(datos.palabras);
  const rivales = posicionesDeRivales(datos);

  return (
    <div className="flex flex-col gap-4">
      {ejemplo && (
      <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
        Palabras clave <strong>inventadas</strong> para la vista previa (aún no hay capturas de Cerebro ni Magnet). Solo la búsqueda principal de cada país es la real de Xray.
      </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {paises.map((p) => (
          <button
            key={p}
            onClick={() => setPais(p)}
            aria-pressed={p === pais}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${p === pais ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
          >
            <Pais codigo={p} />
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { t: "Palabras clave", v: formatNumero(lista.length), s: `analizadas en ${nombrePais(pais)}` },
          { t: "Búsquedas al mes", v: formatNumero(lista.reduce((s, p) => s + p.busquedas, 0)), s: "sumando todas" },
          { t: "Imprescindibles", v: formatNumero(clases.filter((c) => c === "imprescindible").length), s: "tienen que ir en tu título" },
          { t: "Oportunidades", v: formatNumero(clases.filter((c) => c === "oportunidad").length), s: "búsquedas con poca competencia" },
        ].map((x) => (
          <div key={x.t} className="rounded-xl border border-white/[0.06] bg-ink-900/80 p-4 shadow-soft">
            <p className="text-xs text-ink-400">{x.t}</p>
            <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink-100">{x.v}</p>
            <p className="mt-1 text-xs text-ink-400">{x.s}</p>
          </div>
        ))}
      </div>

      <Tarjeta titulo="Palabras clave" subtitulo="De Cerebro (las que posicionan a los competidores) y Magnet (variantes de la búsqueda), ordenadas por búsquedas">
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="tabular w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-left text-xs text-ink-400">
                <th className="px-2 py-2 font-medium">Palabra clave</th>
                <th className="px-2 py-2 font-medium">Tipo</th>
                <th className="px-2 py-2 text-right font-medium">Búsquedas</th>
                <th className="px-2 py-2 text-right font-medium" title="Variación de búsquedas frente al mes anterior">Tendencia</th>
                <th className="px-2 py-2 text-right font-medium" title="Productos que Amazon muestra para esa búsqueda">Productos</th>
                <th className="px-2 py-2 text-right font-medium" title="Ventas en 8 días que hacen falta para llegar a la primera página (CPR de Cerebro)">Ventas para pág. 1</th>
                <th className="px-2 py-2 text-right font-medium" title="Cuántos de los primeros productos la llevan en el título">En títulos</th>
                <th className="px-2 py-2 text-right font-medium">Puja PPC</th>
                {datos.rivales.map((r) => (
                  <th key={r} className="px-2 py-2 text-right font-medium whitespace-nowrap" title={`Posición orgánica de ${r}`}>
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((p, i) => (
                <tr key={p.texto} className="border-b border-white/[0.05]">
                  <td className="px-2 py-2 font-medium text-ink-100">{p.texto}</td>
                  <td className="px-2 py-2">
                    <span title={CLASES[clases[i]].ayuda} className={`rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${CLASES[clases[i]].clase}`}>
                      {CLASES[clases[i]].texto}
                    </span>
                  </td>
                  <td className={`px-2 py-2 text-right ${p.busquedas === 0 ? "text-warning" : "text-ink-100"}`}>{formatNumero(p.busquedas)}</td>
                  <td className={`px-2 py-2 text-right ${p.tendencia > 0 ? "text-success" : p.tendencia < 0 ? "text-danger" : "text-ink-400"}`}>
                    {p.tendencia > 0 ? "↑ +" : p.tendencia < 0 ? "↓ " : ""}
                    {p.tendencia} %
                  </td>
                  <td className="px-2 py-2 text-right">{formatNumero(p.competidores)}</td>
                  <td className="px-2 py-2 text-right">{p.cpr}</td>
                  <td className="px-2 py-2 text-right">{p.densidadTitulos}</td>
                  <td className="px-2 py-2 text-right">{formatMoneda(p.pujaPpc, moneda)}</td>
                  {p.posiciones.map((pos, j) => (
                    <td key={j} className="px-2 py-2 text-right">
                      <Posicion valor={pos} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 flex flex-col gap-1 text-xs text-ink-400">
          {(["imprescindible", "oportunidad", "secundaria"] as const).map((c) => (
            <li key={c}>
              <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium ${CLASES[c].clase}`}>{CLASES[c].texto}</span>
              {CLASES[c].ayuda}
            </li>
          ))}
        </ul>
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Palabras para tu título" subtitulo="Cada palabra con las búsquedas de todas las frases que la contienen: de arriba abajo, por importancia">
          <Barras
            filas={titulo.map((w) => ({
              clave: w.palabra,
              etiqueta: w.palabra,
              valor: w.busquedas,
              texto: formatNumero(w.busquedas),
              detalle: `«${w.palabra}» aparece en ${w.frases} ${w.frases === 1 ? "palabra clave" : "palabras clave"} que suman ${formatNumero(w.busquedas)} búsquedas al mes`,
            }))}
          />
        </Tarjeta>

        <Tarjeta titulo="Dónde se posiciona cada competidor" subtitulo="En estas palabras clave: cuántas tiene en el top 10 y cuántas búsquedas le llegan por ellas">
          <div className="flex flex-col gap-3">
            {rivales.map((r) => (
              <div key={r.rival} className="rounded-lg border border-white/[0.06] bg-ink-950/40 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink-100">{r.rival}</span>
                  <span className="tabular text-xs text-ink-400">
                    {r.enTop10} en el top 10 · {formatNumero(r.busquedasCaptadas)} búsquedas/mes · posición media {r.posicionMedia !== null ? `#${r.posicionMedia.toLocaleString("es-ES")}` : "—"}
                  </span>
                </div>
                <p className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                  {r.mejores.map((m) => (
                    <span key={m.texto} className="rounded bg-white/[0.04] px-1.5 py-0.5 text-ink-300">
                      {m.texto} <Posicion valor={m.posicion} />
                    </span>
                  ))}
                </p>
              </div>
            ))}
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}
