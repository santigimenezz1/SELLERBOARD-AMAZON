"use client";

import { useState } from "react";
import type { CodigoPais, EstudioH10 } from "@/lib/datos/h10Tipos";
import { EUR_POR_GBP, nombrePais } from "@/lib/datos/h10Analisis";
import { temporada, type Temporada } from "@/lib/datos/h10Temporada";
import { formatNumero } from "@/lib/format";
import { Pais, Seccion, Tarjeta } from "./comun";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** The 3 years on the chart, oldest faintest: one hue, so «more intense = more recent». */
const OPACIDADES = [0.3, 0.6, 1];
const euros = (v: number) => `${formatNumero(Math.round(v))} €`;
const corto = (v: number) => (v >= 1_000_000 ? `${formatNumero(Math.round(v / 100_000) / 10)} M €` : v >= 1000 ? `${formatNumero(Math.round(v / 1000))} k €` : euros(v));
const nombreMes = (mes: string) => `${MESES_LARGOS[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

type Serie = Map<string, number>;

/** The market's size month by month in euros: one country, or every country with a search chart added up. */
function series(estudio: EstudioH10) {
  const porPais = new Map<CodigoPais, Serie>();
  /** What each country's revenue per search was worked out from, for the reliability note. */
  const bases = new Map<CodigoPais, Temporada>();
  /** The searches each month: what the revenue is proportional to. */
  const busquedasPais = new Map<CodigoPais, Serie>();
  for (const m of estudio.mercados) {
    const h = estudio.busquedas?.[m.codigoPais];
    const t = h && temporada(m, h, estudio.xraysAnteriores?.[m.codigoPais]);
    if (t) bases.set(m.codigoPais, t);
    if (!t) continue;
    const cambio = m.moneda === "GBP" ? EUR_POR_GBP : 1;
    porPais.set(m.codigoPais, new Map(t.meses.map((x) => [x.mes, x.facturacion * cambio])));
    busquedasPais.set(m.codigoPais, new Map(t.meses.map((x) => [x.mes, x.busquedas])));
  }
  // «All countries»: only the months every included country has, so no month adds up half the countries.
  const comunes = [...porPais.values()].reduce<string[] | null>((acc, s) => (acc === null ? [...s.keys()] : acc.filter((mes) => s.has(mes))), null) ?? [];
  const todos: Serie = new Map(comunes.sort().map((mes) => [mes, [...porPais.values()].reduce((s, serie) => s + serie.get(mes)!, 0)]));
  const busquedasTodos: Serie = new Map([...todos.keys()].map((mes) => [mes, [...busquedasPais.values()].reduce((s, serie) => s + serie.get(mes)!, 0)]));
  return { porPais, todos, busquedasPais, busquedasTodos, bases };
}

/** The key figures of a series: the last 12 months against the 12 before. */
function cifras(s: Serie) {
  const meses = [...s.keys()].sort();
  const ultimos = meses.slice(-12);
  const previos = meses.slice(-24, -12);
  const suma = (lista: string[]) => lista.reduce((t, mes) => t + s.get(mes)!, 0);
  const orden = [...ultimos].sort((a, b) => s.get(b)! - s.get(a)!);
  return {
    total: suma(ultimos),
    media: ultimos.length ? suma(ultimos) / ultimos.length : 0,
    fuerte: orden[0],
    flojo: orden.at(-1)!,
    crecimiento: previos.length === 12 ? suma(ultimos) / suma(previos) - 1 : null,
    desde: ultimos[0],
    hasta: ultimos.at(-1)!,
  };
}

/** January to December with each of the last 3 years as a line: the season and whether every year beats the last. */
function Grafico({ s, anios }: { s: Serie; anios: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 240;
  const M = { izq: 56, der: 44, arriba: 12, abajo: 26 };
  const valores = [...s.values()];
  const max = Math.max(...valores, 1) * 1.1;
  const pasoBruto = max / 4;
  const p = 10 ** Math.floor(Math.log10(pasoBruto));
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= pasoBruto)!;
  const tope = Math.ceil(max / paso) * paso;
  const x = (i: number) => M.izq + (i / 11) * (W - M.izq - M.der);
  const y = (v: number) => M.arriba + (1 - v / tope) * (H - M.arriba - M.abajo);
  const valor = (anio: number, i: number) => s.get(`${anio}-${String(i + 1).padStart(2, "0")}`);
  // Where each line's year label goes: at its last point, pushed apart when two would overlap.
  const etiquetas = new Map<number, { x: number; y: number }>();
  for (const anio of anios) {
    const ult = MESES.map((_, i) => i).filter((i) => valor(anio, i) !== undefined).at(-1);
    if (ult !== undefined) etiquetas.set(anio, { x: x(ult) + 7, y: y(valor(anio, ult)!) + 4 });
  }
  const orden = [...etiquetas.values()].sort((a, b) => a.y - b.y);
  orden.forEach((e, i) => {
    const previa = orden.slice(0, i).filter((o) => Math.abs(o.x - e.x) < 30).at(-1);
    if (previa && e.y - previa.y < 13) e.y = previa.y + 13;
  });

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label="Tamaño del mercado por mes y año">
        {Array.from({ length: Math.round(tope / paso) + 1 }, (_, k) => k * paso).map((v) => (
          <g key={v}>
            <line x1={M.izq} x2={W - M.der} y1={y(v)} y2={y(v)} className="stroke-white/[0.06]" />
            <text x={M.izq - 8} y={y(v) + 4} textAnchor="end" className="fill-ink-500 text-[11px]">
              {corto(v)}
            </text>
          </g>
        ))}
        {MESES.map((m, i) => (
          <text key={m} x={x(i)} y={H - 6} textAnchor="middle" className={`text-[11px] ${hover === i ? "fill-ink-100" : "fill-ink-500"}`}>
            {m}
          </text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.arriba} y2={H - M.abajo} className="stroke-white/25" />}
        {anios.map((anio, k) => {
          const puntos = MESES.map((_, i) => [i, valor(anio, i)] as const).filter(([, v]) => v !== undefined) as [number, number][];
          if (!puntos.length) return null;
          // A line per run of months (a year that starts or ends half-way just stops there).
          const d = puntos.map(([i, v], n) => `${n && puntos[n - 1][0] === i - 1 ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
          const etiqueta = etiquetas.get(anio)!;
          const opacidad = OPACIDADES[OPACIDADES.length - anios.length + k];
          return (
            <g key={anio}>
              <path d={d} fill="none" className="stroke-serie-ventas" strokeOpacity={opacidad} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              {hover !== null && valor(anio, hover) !== undefined && (
                <circle cx={x(hover)} cy={y(valor(anio, hover)!)} r={4.5} className="fill-serie-ventas stroke-ink-900" fillOpacity={opacidad} strokeWidth={2} />
              )}
              {/* Direct label at the end of each line. */}
              <text x={etiqueta.x} y={etiqueta.y} className="fill-ink-300 text-[11px] font-medium">
                {anio}
              </text>
            </g>
          );
        })}
        {MESES.map((m, i) => (
          <rect key={m} x={x(i) - (W - M.izq - M.der) / 22} y={0} width={(W - M.izq - M.der) / 11} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 min-w-36 rounded-lg border border-white/[0.1] bg-ink-900 px-3 py-2 text-xs shadow-xl"
          style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% + 12px), calc(100% - 150px))` }}
        >
          <p className="mb-1 font-semibold text-ink-100 capitalize">{MESES_LARGOS[hover]}</p>
          {[...anios].reverse().map((anio) => (
            <p key={anio} className="flex justify-between gap-4">
              <span className="text-ink-400">{anio}</span>
              <span className="tabular font-medium text-ink-100">{valor(anio, hover) !== undefined ? euros(valor(anio, hover)!) : "—"}</span>
            </p>
          ))}
        </div>
      )}
      <div className="mt-1 flex flex-wrap justify-center gap-4 text-xs text-ink-400">
        {anios.map((anio, k) => (
          <span key={anio} className="flex items-center gap-1.5">
            <span className="h-[3px] w-5 rounded-full bg-serie-ventas" style={{ opacity: OPACIDADES[OPACIDADES.length - anios.length + k] }} />
            {anio}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Each month in a row and each year in a column, with the year's total: the same as the chart, to read exact figures. */
function Tabla({ s, b, anios }: { s: Serie; b?: Serie; anios: number[] }) {
  const clave = (anio: number, i: number) => `${anio}-${String(i + 1).padStart(2, "0")}`;
  const valor = (anio: number, i: number) => s.get(clave(anio, i));
  const maxAnio = (anio: number) => Math.max(...MESES.map((_, i) => valor(anio, i) ?? 0));
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="tabular w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] text-xs text-ink-400">
            <th className="px-2 py-2 text-left font-medium">Mes</th>
            {anios.map((a) => (
              <th key={a} className="px-2 py-2 text-right font-medium">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MESES_LARGOS.map((m, i) => (
            <tr key={m} className="border-b border-white/[0.04]">
              <td className="px-2 py-1.5 text-ink-300 capitalize">{m}</td>
              {anios.map((a) => {
                const v = valor(a, i);
                const pico = v !== undefined && v === maxAnio(a);
                return (
                  <td key={a} className={`px-2 py-1.5 text-right ${pico ? "font-semibold text-ink-100" : "text-ink-300"}`} title={pico ? "El mes más fuerte de ese año" : undefined}>
                    {v !== undefined ? euros(v) : <span className="text-ink-600">—</span>}
                    {v !== undefined && b?.has(clave(a, i)) && <span className="block text-[10px] font-normal text-ink-500">{formatNumero(b.get(clave(a, i))!)} búsquedas</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-white/[0.12] text-ink-100">
            <td className="px-2 py-2 font-semibold">Total del año</td>
            {anios.map((a) => {
              const meses = MESES.map((_, i) => valor(a, i)).filter((v): v is number => v !== undefined);
              return (
                <td key={a} className="px-2 py-2 text-right font-semibold">
                  {euros(meses.reduce((t, v) => t + v, 0))}
                  {meses.length < 12 && <span className="block text-[10px] font-normal text-ink-500">{meses.length} meses</span>}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * The last 12 months as buttons, each with its size; the chosen one opens below: its revenue, its searches, how it
 * compares with the year's average and, for every country together, what each country makes that month.
 */
function MesAMes({
  s,
  b,
  media,
  porPais,
  elegido,
  onElegir,
}: {
  s: Serie;
  b?: Serie;
  media: number;
  porPais: Map<CodigoPais, Serie> | null;
  elegido: string | null;
  onElegir: (mes: string) => void;
}) {
  const meses = [...s.keys()].sort().slice(-12);
  const mes = elegido && meses.includes(elegido) ? elegido : meses.at(-1)!;
  const max = Math.max(...meses.map((m) => s.get(m)!));
  const valor = s.get(mes)!;
  const frente = media ? valor / media - 1 : 0;
  const paises = porPais ? [...porPais].map(([p, serie]) => ({ p, v: serie.get(mes) ?? 0 })).sort((x, y) => y.v - x.v) : [];
  return (
    <div className="flex flex-col gap-3">
      <Seccion titulo="Mes a mes" texto="Toca un mes para ver cuánto facturó el mercado y qué parte aporta cada país" />
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-12">
        {meses.map((m) => {
          const v = s.get(m)!;
          const activo = m === mes;
          return (
            <button
              key={m}
              onClick={() => onElegir(m)}
              aria-pressed={activo}
              className={`flex flex-col items-center gap-1 rounded-lg border px-1 pt-1.5 pb-1 transition-colors ${activo ? "border-accent-500/70 bg-accent-500/10" : "border-white/[0.06] hover:border-white/[0.16]"}`}
            >
              <span className={`text-[11px] font-medium ${activo ? "text-ink-100" : "text-ink-400"}`}>
                {MESES[Number(m.slice(5, 7)) - 1]} {m.slice(2, 4)}
              </span>
              {/* A small bar: the month's size against the strongest one. */}
              <span className="flex h-8 w-full items-end justify-center">
                <span className={`w-3 rounded-t-sm ${activo ? "bg-accent-400" : "bg-serie-ventas/70"}`} style={{ height: `${Math.max(6, (v / max) * 100)}%` }} />
              </span>
              <span className="tabular text-[10px] text-ink-300">{corto(v)}</span>
            </button>
          );
        })}
      </div>
      <div className="rounded-lg border border-white/[0.06] bg-ink-950/40 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="text-sm text-ink-300 capitalize">{nombreMes(mes)}</p>
          <p className={`text-xs font-medium ${frente >= 0 ? "text-success" : "text-warning"}`}>
            {frente >= 0 ? "+" : "−"}
            {Math.abs(Math.round(frente * 100))} % frente a la media del año ({euros(media)})
          </p>
        </div>
        <p className="tabular mt-1 text-3xl font-semibold text-ink-100">{euros(valor)}</p>
        <p className="text-xs text-ink-400">facturación del mercado ese mes{b?.has(mes) ? ` · ${formatNumero(b.get(mes)!)} búsquedas` : ""}</p>
        {paises.length > 1 && (
          <ul className="mt-3 flex flex-col gap-2 border-t border-white/[0.06] pt-3">
            {paises.map(({ p, v }) => (
              <li key={p} className="grid grid-cols-[88px_1fr_auto] items-center gap-3 text-sm">
                <Pais codigo={p} corto />
                <span className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                  <span className="block h-full rounded-full bg-serie-ventas" style={{ width: `${(v / Math.max(1, valor)) * 100}%` }} />
                </span>
                <span className="tabular text-right text-ink-100">
                  {euros(v)} <span className="text-xs text-ink-500">{Math.round((v / Math.max(1, valor)) * 100)} %</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: React.ReactNode; detalle: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-ink-950/40 px-3.5 py-3">
      <p className="text-[13px] font-medium text-ink-200">{titulo}</p>
      <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink-100">{valor}</p>
      <p className="mt-0.5 text-xs text-ink-400">{detalle}</p>
    </div>
  );
}

/**
 * «Tamaño del mercado mes a mes»: per country, or every country added up, the market's revenue each month of the last
 * years, estimated from its Xray (euros per search) and its 3-year search chart.
 */
export function TamanoMercado({ estudio, onIrADatos }: { estudio: EstudioH10; onIrADatos?: () => void }) {
  const { porPais, todos, busquedasPais, busquedasTodos, bases } = series(estudio);
  const paises = estudio.mercados.map((m) => m.codigoPais);
  const sinGrafico = paises.filter((p) => !porPais.has(p));
  const [vista, setVista] = useState<"todos" | CodigoPais>("todos");
  /** The month chosen in the month strip (the latest one until one is picked). */
  const [mesElegido, setMesElegido] = useState<string | null>(null);
  const s = vista === "todos" ? todos : porPais.get(vista);

  const pestana = (id: "todos" | CodigoPais, etiqueta: React.ReactNode) => (
    <button
      key={id}
      onClick={() => setVista(id)}
      aria-pressed={vista === id}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${vista === id ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
    >
      {etiqueta}
      {id !== "todos" && !porPais.has(id) && <span className="text-warning" title="Falta su gráfico de búsquedas">•</span>}
    </button>
  );

  return (
    <Tarjeta titulo="Tamaño del mercado mes a mes" subtitulo="Lo que se factura cada mes, estimado con las búsquedas de los últimos 3 años de cada país">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {pestana("todos", "Todos los países")}
        {paises.map((p) => pestana(p, <Pais codigo={p} corto />))}
      </div>

      {!s || s.size === 0 ? (
        <div className="rounded-lg border border-dashed border-white/[0.12] px-4 py-8 text-center text-sm text-ink-400">
          <p>
            {vista === "todos" ? "Ningún país tiene todavía su gráfico de búsquedas." : `Falta el gráfico de búsquedas de ${nombrePais(vista)}.`} Sube la captura del gráfico{" "}
            <strong className="text-ink-200">«Search Volume» de 3 años</strong> de Helium 10 (en el Xray, la minigráfica junto a Search Volume → «3 Years») como «Historial de búsquedas».
          </p>
          {onIrADatos && (
            <button onClick={onIrADatos} className="mt-3 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-950 hover:bg-accent-400">
              Ir a Datos
            </button>
          )}
        </div>
      ) : (
        (() => {
          const c = cifras(s);
          const anios = [...new Set([...s.keys()].map((m) => Number(m.slice(0, 4))))].sort().slice(-3);
          return (
            <div className="flex flex-col gap-4">
              <Seccion titulo="Resumen del último año" texto="Lo que mueve el mercado al mes y al año, su temporada y si crece" />
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Cifra titulo="Media al mes" valor={euros(c.media)} detalle="último año" />
                <Cifra titulo="Total del último año" valor={euros(c.total)} detalle={`${nombreMes(c.desde)} a ${nombreMes(c.hasta)}`} />
                <Cifra
                  titulo="Mes más fuerte · más flojo"
                  valor={
                    <>
                      <span className="text-success">{MESES[Number(c.fuerte.slice(5, 7)) - 1]}</span> · <span className="text-danger">{MESES[Number(c.flojo.slice(5, 7)) - 1]}</span>
                    </>
                  }
                  detalle={
                    <>
                      <span className="text-success">{corto(s.get(c.fuerte)!)}</span> frente a <span className="text-danger">{corto(s.get(c.flojo)!)}</span>
                    </>
                  }
                />
                <Cifra
                  titulo="Frente al año anterior"
                  valor={c.crecimiento === null ? "—" : `${c.crecimiento >= 0 ? "+" : "−"}${Math.abs(Math.round(c.crecimiento * 100))} %`}
                  detalle={c.crecimiento === null ? "hace falta más historial" : c.crecimiento >= 0.05 ? "el mercado crece" : c.crecimiento <= -0.05 ? "el mercado baja" : "estable"}
                />
              </div>
              <div className="mt-2" />
              <MesAMes
                s={s}
                b={vista === "todos" ? busquedasTodos : busquedasPais.get(vista)}
                media={c.media}
                porPais={vista === "todos" ? porPais : null}
                elegido={mesElegido}
                onElegir={setMesElegido}
              />
              <div className="mt-2" />
              <Seccion titulo="Los últimos 3 años" texto="Una línea por año: compara la misma época de cada año para ver la temporada y si el mercado crece" />
              <Grafico s={s} anios={anios} />
              <div className="mt-2" />
              <Seccion titulo="Tabla por meses" texto="Facturación y búsquedas de cada mes, con el total de cada año abajo" />
              <Tabla s={s} b={vista === "todos" ? busquedasTodos : busquedasPais.get(vista)} anios={anios} />
              <p className="text-[11px] leading-relaxed text-ink-500">
                Cómo se calcula: lo que factura el Xray de cada país (suma de «ASIN Revenue») dividido entre sus búsquedas de ese mes da los euros por búsqueda; multiplicado por las búsquedas de cada mes, el tamaño del
                mercado de ese mes. Es una estimación (±20 %): los meses de hace 2–3 años suponen el mismo gasto por búsqueda que hoy.
                {` ${[...bases]
                  .filter(([p]) => vista === "todos" || p === vista)
                  .map(([p, t]) => `${nombrePais(p)}: ${formatNumero(Math.round(t.porBusqueda * 10) / 10)} € por búsqueda, de ${t.xrays === 1 ? "1 Xray" : `${t.xrays} Xray`}${t.semanasExactas ? " (sus 30 días exactos)" : ""}`)
                  .join(" · ")}.`}
                {[...bases].some(([p, t]) => (vista === "todos" || p === vista) && t.xrays === 1) && " Para afinarlo, sube otro Xray del mismo país de otro mes (mejor uno de temporada alta)."}
                {vista === "todos" && ` Suma ${[...porPais.keys()].map(nombrePais).join(", ")}${sinGrafico.length ? `; sin gráfico de búsquedas, no se incluyen: ${sinGrafico.map(nombrePais).join(", ")}` : ""}. Libras pasadas a euros.`}
              </p>
            </div>
          );
        })()
      )}
    </Tarjeta>
  );
}
