"use client";

import { useEffect, useRef, useState } from "react";
import type { PuntoVentas } from "@/lib/datos/ventas";
import { nombreDia, nombreMes } from "@/lib/datos/periodos";
import { formatEuros, formatNumero } from "@/lib/format";
import { useNavegarPanel } from "./Transicion";
import { urlPanel, type EstadoUrl } from "./url";

type Metrica = "ventas" | "unidades";

const ALTO = 260;
const M = { arriba: 12, derecha: 12, abajo: 26, izquierda: 60 };

/** Round axis ticks: 0, 100, 200… */
function marcas(max: number, n = 4): number[] {
  const paso0 = Math.max(max, 1) / n;
  const mag = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((p) => p >= paso0) ?? paso0;
  return Array.from({ length: Math.ceil(Math.max(max, 1) / paso) + 1 }, (_, i) => Math.round(i * paso * 100) / 100);
}

type Props = {
  serie: PuntoVentas[];
  mes: string;
  meses: string[];
  /** Day selected in the tiles (single-day tile), highlighted in the chart. */
  diaSeleccionado: string | null;
  base: string;
  estado: EstadoUrl;
};

/**
 * Sales (or units) per day of a month, with the 7-day moving average as a
 * trend line. Clicking a day opens it as its own tile.
 */
export function GraficoMes({ serie, mes, meses, diaSeleccionado, base, estado }: Props) {
  const { navegar } = useNavegarPanel();
  const cont = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(900);
  const [metrica, setMetrica] = useState<Metrica>("ventas");
  const [activo, setActivo] = useState<number | null>(null);
  const [verTabla, setVerTabla] = useState(false);

  useEffect(() => {
    const el = cont.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(300, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [verTabla]);

  const valor = (p: PuntoVentas) => (metrica === "ventas" ? p.ventas : p.unidades);
  const media = (p: PuntoVentas) => (metrica === "ventas" ? p.mediaVentas : p.mediaUnidades);
  const fmt = (v: number) => (metrica === "ventas" ? formatEuros(v) : formatNumero(v));

  const pasados = serie.filter((p) => !p.futuro);
  const totalVentas = pasados.reduce((s, p) => s + p.ventas, 0);
  const totalUnidades = pasados.reduce((s, p) => s + p.unidades, 0);

  const ticks = marcas(Math.max(...serie.map((p) => Math.max(valor(p), media(p) ?? 0)), 1));
  const yMax = ticks[ticks.length - 1];
  const w = ancho - M.izquierda - M.derecha;
  const h = ALTO - M.arriba - M.abajo;
  const paso = w / serie.length;
  const anchoBarra = Math.max(2, Math.min(28, paso - 2)); // 2px surface gap between bars
  const x = (i: number) => M.izquierda + i * paso + paso / 2;
  const y = (v: number) => M.arriba + (1 - v / yMax) * h;

  const lineaMedia = serie
    .map((p, i) => (media(p) === null ? null : `${x(i).toFixed(1)},${y(media(p)!).toFixed(1)}`))
    .filter(Boolean)
    .map((pt, i) => `${i ? "L" : "M"}${pt}`)
    .join("");

  const elegirDia = (p: PuntoVentas) => {
    if (p.futuro) return;
    navegar(urlPanel(base, estado, { e: "rango", p: "rango", desde: p.dia, hasta: p.dia }));
    // The chart sits at the bottom: bring the day's tile and products into view.
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function teclado(e: React.KeyboardEvent) {
    const ultimo = pasados.length - 1;
    if (e.key === "ArrowRight") setActivo((a) => Math.min(ultimo, (a ?? -1) + 1));
    else if (e.key === "ArrowLeft") setActivo((a) => Math.max(0, (a ?? pasados.length) - 1));
    else if (e.key === "Enter" && activo !== null) elegirDia(serie[activo]);
    else if (e.key === "Escape") setActivo(null);
    else return;
    e.preventDefault();
  }

  const punto = activo !== null ? serie[activo] : null;
  const anterior = activo !== null && activo > 0 ? serie[activo - 1] : null;
  const variacion = punto && anterior && valor(anterior) > 0 ? ((valor(punto) - valor(anterior)) / valor(anterior)) * 100 : null;
  const tooltipIzquierda = activo !== null && x(activo) > ancho - 230;

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-ink-900/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink-100">Ventas por día · {nombreMes(mes)}</h2>
          <p className="tabular mt-0.5 text-sm text-ink-400">
            {formatEuros(totalVentas)} · {formatNumero(totalUnidades)} {totalUnidades === 1 ? "unidad" : "unidades"}
            {pasados.length > 0 && <> · media {metrica === "ventas" ? formatEuros(totalVentas / pasados.length) : formatNumero(totalUnidades / pasados.length)}/día</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Qué mostrar" className="flex rounded-lg border border-white/[0.08] bg-ink-950/40 p-0.5">
            {(["ventas", "unidades"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetrica(m)}
                aria-pressed={metrica === m}
                className={`h-7 rounded-md px-3 text-sm transition-colors ${metrica === m ? "bg-white/[0.09] font-medium text-ink-100" : "text-ink-400 hover:text-ink-100"}`}
              >
                {m === "ventas" ? "Ventas €" : "Unidades"}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="mes-grafico">
            Mes
          </label>
          <select
            id="mes-grafico"
            value={mes}
            onChange={(e) => navegar(urlPanel(base, estado, { mes: e.target.value === meses[0] ? null : e.target.value }))}
            className="h-8 rounded-lg border border-white/[0.08] bg-ink-900 px-2.5 text-sm text-ink-100 outline-none [color-scheme:dark] hover:border-white/[0.16] focus:border-accent-500/70"
          >
            {meses.map((m) => (
              <option key={m} value={m}>
                {nombreMes(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-ink-300">
        <ul className="flex items-center gap-4" aria-label="Leyenda">
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-serie-ventas" aria-hidden />
            {metrica === "ventas" ? "Ventas del día" : "Unidades del día"}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-serie-beneficio" aria-hidden />
            Media de 7 días (tendencia)
          </li>
        </ul>
        <button onClick={() => setVerTabla((v) => !v)} className="text-ink-400 underline-offset-4 hover:text-ink-100 hover:underline">
          {verTabla ? "Ver gráfico" : "Ver como tabla"}
        </button>
      </div>

      {verTabla ? (
        <div className="mt-3 max-h-[300px] overflow-auto">
          <table className="tabular w-full text-sm">
            <thead className="sticky top-0 bg-ink-900 text-left text-xs text-ink-400">
              <tr>
                <th className="py-1.5 font-medium">Día</th>
                <th className="py-1.5 text-right font-medium">Ventas</th>
                <th className="py-1.5 text-right font-medium">Unidades</th>
                <th className="py-1.5 text-right font-medium">Media 7 días</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {pasados.map((p) => (
                <tr key={p.dia}>
                  <td className="py-1.5 text-ink-300">{nombreDia(p.dia)}</td>
                  <td className="py-1.5 text-right">{formatEuros(p.ventas)}</td>
                  <td className="py-1.5 text-right">{formatNumero(p.unidades)}</td>
                  <td className="py-1.5 text-right text-ink-300">{metrica === "ventas" ? formatEuros(p.mediaVentas) : formatNumero(p.mediaUnidades ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={cont} className="relative mt-2 min-w-0">
          <svg
            viewBox={`0 0 ${ancho} ${ALTO}`}
            width="100%"
            height={ALTO}
            role="img"
            aria-label={`${metrica === "ventas" ? "Ventas" : "Unidades"} por día de ${nombreMes(mes)}. Flechas para recorrer los días, Intro para abrir uno.`}
            tabIndex={0}
            onKeyDown={teclado}
            onBlur={() => setActivo(null)}
            className="block w-full overflow-visible outline-none"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.izquierda} x2={M.izquierda + w} y1={y(t)} y2={y(t)} stroke={t === 0 ? "rgb(255 255 255 / 0.18)" : "rgb(255 255 255 / 0.05)"} />
                <text x={M.izquierda - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular fill-ink-400 text-[11px]">
                  {metrica === "ventas" ? formatEuros(t, 0) : formatNumero(t)}
                </text>
              </g>
            ))}

            {serie.map((p, i) => {
              const dia = Number(p.dia.slice(8));
              const cada = paso < 22 ? 5 : 2;
              // The last day is labelled too, unless it would collide with the previous label.
              const mostrarEtiqueta = dia === 1 || dia % cada === 0 || (i === serie.length - 1 && dia % cada >= Math.ceil(cada / 2));
              const v = valor(p);
              const alto = y(0) - y(v);
              const sel = p.dia === diaSeleccionado;
              const r = Math.min(4, anchoBarra / 2, alto);
              const x0 = x(i) - anchoBarra / 2;
              return (
                <g key={p.dia}>
                  {v > 0 && (
                    // Bar with rounded top corners, anchored flat on the baseline.
                    <path
                      d={`M${x0},${y(0)} V${y(v) + r} Q${x0},${y(v)} ${x0 + r},${y(v)} H${x0 + anchoBarra - r} Q${x0 + anchoBarra},${y(v)} ${x0 + anchoBarra},${y(v) + r} V${y(0)} Z`}
                      className={sel ? "fill-accent-500" : "fill-serie-ventas"}
                      opacity={activo !== null && activo !== i && !sel ? 0.55 : 1}
                    />
                  )}
                  {p.futuro && <rect x={x0} y={y(0) - 2} width={anchoBarra} height={2} rx={1} className="fill-white/[0.08]" />}
                  {mostrarEtiqueta && (
                    <text x={x(i)} y={ALTO - 8} textAnchor="middle" className={`text-[11px] ${sel ? "fill-accent-400 font-semibold" : "fill-ink-400"}`}>
                      {dia}
                    </text>
                  )}
                  {alto > 0 && <title>{`${nombreDia(p.dia)}: ${fmt(v)}`}</title>}
                </g>
              );
            })}

            <path d={lineaMedia} fill="none" stroke="var(--color-serie-beneficio)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {punto && media(punto) !== null && (
              <circle cx={x(activo!)} cy={y(media(punto)!)} r={4.5} fill="var(--color-serie-beneficio)" stroke="var(--color-ink-900)" strokeWidth={2} />
            )}

            {/* Hit areas: a full-height column per day, wider than the bar. */}
            {serie.map((p, i) => (
              <rect
                key={p.dia}
                x={M.izquierda + i * paso}
                y={M.arriba}
                width={paso}
                height={h}
                fill="transparent"
                className={p.futuro ? "" : "cursor-pointer"}
                onPointerEnter={() => setActivo(p.futuro ? null : i)}
                onPointerLeave={() => setActivo(null)}
                onClick={() => elegirDia(p)}
              />
            ))}
          </svg>

          {punto && activo !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 min-w-[200px] rounded-lg border border-white/[0.08] bg-ink-850/95 px-3 py-2 shadow-soft backdrop-blur"
              style={tooltipIzquierda ? { right: ancho - x(activo) + 14 } : { left: x(activo) + 14 }}
            >
              <p className="text-xs text-ink-400">{nombreDia(punto.dia)}</p>
              <p className="tabular mt-1 text-base font-semibold text-ink-100">{formatEuros(punto.ventas)}</p>
              <p className="tabular text-sm text-ink-300">
                {formatNumero(punto.unidades)} {punto.unidades === 1 ? "unidad" : "unidades"}
              </p>
              {variacion !== null && (
                <p className={`tabular mt-1 text-xs font-medium ${variacion >= 0 ? "text-success" : "text-danger"}`}>
                  {variacion >= 0 ? "▲" : "▼"} {Math.abs(variacion).toLocaleString("es-ES", { maximumFractionDigits: 0 })} % {metrica === "ventas" ? "en ventas" : "en unidades"} vs. el día anterior
                </p>
              )}
              <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-400">
                <span className="h-0.5 w-3 rounded-full bg-serie-beneficio" aria-hidden />
                Media 7 días: {metrica === "ventas" ? formatEuros(punto.mediaVentas) : formatNumero(punto.mediaUnidades ?? 0)}
              </p>
              <p className="mt-1.5 text-[11px] text-ink-600">Clic para ver este día</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
