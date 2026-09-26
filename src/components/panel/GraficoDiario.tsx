"use client";

import { useEffect, useRef, useState } from "react";
import type { PuntoDia } from "@/lib/datos/panel";
import { formatDiaCorto, formatDiaLargo, formatEuros } from "@/lib/format";

const SERIES = [
  { clave: "ventas", nombre: "Ventas", color: "var(--color-serie-ventas)" },
  { clave: "beneficio", nombre: "Beneficio neto", color: "var(--color-serie-beneficio)" },
] as const;

const ALTO = 280;
const M = { arriba: 16, derecha: 104, abajo: 28, izquierda: 64 };

/** Round axis ticks: 0, 250, 500… */
function marcas(min: number, max: number, n = 4): number[] {
  const rango = max - min || 1;
  const paso0 = rango / n;
  const mag = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((p) => p >= paso0) ?? paso0;
  const res: number[] = [];
  for (let v = Math.floor(min / paso) * paso; v <= max + paso * 0.001; v += paso) res.push(Math.round(v * 100) / 100);
  return res;
}

export function GraficoDiario({ serie }: { serie: PuntoDia[] }) {
  const cont = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(800);
  const [activo, setActivo] = useState<number | null>(null);
  const [verTabla, setVerTabla] = useState(false);

  useEffect(() => {
    const el = cont.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(320, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const valores = serie.flatMap((d) => [d.ventas, d.beneficio]);
  const ticks = marcas(Math.min(0, ...valores), Math.max(1, ...valores));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const w = ancho - M.izquierda - M.derecha;
  const h = ALTO - M.arriba - M.abajo;
  const x = (i: number) => M.izquierda + (serie.length === 1 ? w / 2 : (i / (serie.length - 1)) * w);
  const y = (v: number) => M.arriba + (1 - (v - yMin) / (yMax - yMin)) * h;

  const cadaN = Math.ceil(serie.length / Math.max(2, Math.floor(w / 72)));
  const ultimo = serie.length - 1;

  // End-of-line labels, nudged apart when the two lines finish close together.
  const etiquetas = SERIES.map((s) => ({ ...s, y: y(serie[ultimo]?.[s.clave] ?? 0) }));
  if (Math.abs(etiquetas[0].y - etiquetas[1].y) < 16) {
    const [alta, baja] = etiquetas[0].y <= etiquetas[1].y ? [etiquetas[0], etiquetas[1]] : [etiquetas[1], etiquetas[0]];
    const medio = (alta.y + baja.y) / 2;
    alta.y = medio - 8;
    baja.y = medio + 8;
  }

  function moverPuntero(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = serie.length === 1 ? 0 : Math.round((px / rect.width) * (serie.length - 1));
    setActivo(Math.max(0, Math.min(ultimo, i)));
  }

  function teclado(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") setActivo((a) => Math.min(ultimo, (a ?? -1) + 1));
    else if (e.key === "ArrowLeft") setActivo((a) => Math.max(0, (a ?? serie.length) - 1));
    else if (e.key === "Escape") setActivo(null);
    else return;
    e.preventDefault();
  }

  const punto = activo !== null ? serie[activo] : null;
  const tooltipIzquierda = activo !== null && x(activo) > ancho - 220;

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-ink-900/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-ink-300">Evolución diaria</h2>
        <div className="flex items-center gap-4">
          <ul className="flex items-center gap-4 text-[13px] text-ink-300" aria-label="Leyenda">
            {SERIES.map((s) => (
              <li key={s.clave} className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden />
                {s.nombre}
              </li>
            ))}
          </ul>
          <button onClick={() => setVerTabla((v) => !v)} className="text-xs text-ink-400 underline-offset-4 hover:text-ink-100 hover:underline">
            {verTabla ? "Ver gráfico" : "Ver como tabla"}
          </button>
        </div>
      </div>

      {verTabla ? (
        <div className="mt-4 max-h-[280px] overflow-auto">
          <table className="tabular w-full text-sm">
            <thead className="sticky top-0 bg-ink-900 text-left text-xs text-ink-400">
              <tr>
                <th className="py-1.5 font-medium">Día</th>
                <th className="py-1.5 text-right font-medium">Ventas</th>
                <th className="py-1.5 text-right font-medium">Beneficio neto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {serie.map((d) => (
                <tr key={d.dia}>
                  <td className="py-1.5 text-ink-300">{formatDiaLargo(d.dia)}</td>
                  <td className="py-1.5 text-right">{formatEuros(d.ventas)}</td>
                  <td className="py-1.5 text-right">{formatEuros(d.beneficio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={cont} className="relative mt-4 min-w-0">
          <svg
            viewBox={`0 0 ${ancho} ${ALTO}`}
            height={ALTO}
            width="100%"
            role="img"
            aria-label="Ventas y beneficio neto por día. Usa las flechas izquierda y derecha para recorrer los días."
            tabIndex={0}
            onKeyDown={teclado}
            onBlur={() => setActivo(null)}
            className="block w-full overflow-visible outline-none"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.izquierda} x2={M.izquierda + w} y1={y(t)} y2={y(t)} stroke={t === 0 ? "rgb(255 255 255 / 0.18)" : "rgb(255 255 255 / 0.05)"} />
                <text x={M.izquierda - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular fill-ink-400 text-[11px]">
                  {formatEuros(t, 0)}
                </text>
              </g>
            ))}
            {serie.map((d, i) =>
              i % cadaN === 0 || i === ultimo ? (
                <text key={d.dia} x={x(i)} y={ALTO - 8} textAnchor="middle" className="fill-ink-400 text-[11px]">
                  {formatDiaCorto(d.dia)}
                </text>
              ) : null,
            )}

            {activo !== null && <line x1={x(activo)} x2={x(activo)} y1={M.arriba} y2={M.arriba + h} stroke="rgb(255 255 255 / 0.25)" />}

            {SERIES.map((s) => (
              <g key={s.clave}>
                {serie.length > 1 && (
                  <path
                    d={serie.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[s.clave]).toFixed(1)}`).join("")}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
                {(serie.length === 1 || activo !== null) && (
                  <circle cx={x(activo ?? 0)} cy={y(serie[activo ?? 0][s.clave])} r={4.5} fill={s.color} stroke="var(--color-ink-900)" strokeWidth={2} />
                )}
              </g>
            ))}

            {etiquetas.map((e) => (
              <text key={e.clave} x={M.izquierda + w + 10} y={e.y} dy="0.32em" className="fill-ink-300 text-[12px]">
                {e.nombre}
              </text>
            ))}

            <rect
              x={M.izquierda}
              y={M.arriba}
              width={w}
              height={h}
              fill="transparent"
              onPointerMove={moverPuntero}
              onPointerLeave={() => setActivo(null)}
            />
          </svg>

          {punto && activo !== null && (
            <div
              className="pointer-events-none absolute top-2 z-10 min-w-[180px] rounded-lg border border-white/[0.08] bg-ink-850/95 px-3 py-2 shadow-soft backdrop-blur"
              style={tooltipIzquierda ? { right: ancho - x(activo) + 12 } : { left: x(activo) + 12 }}
            >
              <p className="text-xs text-ink-400">{formatDiaLargo(punto.dia)}</p>
              {SERIES.map((s) => (
                <p key={s.clave} className="mt-1 flex items-center gap-2 text-sm">
                  <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
                  <span className="tabular font-semibold text-ink-100">{formatEuros(punto[s.clave])}</span>
                  <span className="text-xs text-ink-400">{s.nombre}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
