"use client";

import { useEffect, useRef, useState } from "react";
import type { PasoEquipo } from "@/lib/datos/h10Tipos";
import { EQUIPO } from "@/lib/datos/h10Equipo";
import { AvatarAgente } from "./AvatarAgente";

const ETIQUETAS = 190; // width of the lane names
const CARRIL = 86; // height of a lane
const ARRIBA = 18; // space above the first lane
const NODO = 26; // node size
const SEPARACION = 34; // least gap between two nodes of the same lane
const FINAL = 190; // room for the report card at the end

const ICONO: Record<PasoEquipo["tipo"], string> = { inicio: "▶", estudio: "▤", web: "↗", informe: "✓", aviso: "!", consulta: "?", respuesta: "↩", revision: "★" };
const COLOR_TIPO: Record<PasoEquipo["tipo"], string> = {
  inicio: "#f59e0b",
  estudio: "#38bdf8",
  web: "#34d399",
  informe: "#22c55e",
  aviso: "#f59e0b",
  consulta: "#a78bfa",
  respuesta: "#a78bfa",
  revision: "#fb7185",
};
const NOMBRE_TIPO: Record<PasoEquipo["tipo"], string> = {
  inicio: "Empieza",
  estudio: "Consulta los datos del estudio",
  web: "Investiga en internet",
  informe: "Entrega",
  aviso: "Aviso",
  consulta: "Pregunta a un compañero",
  respuesta: "Responde a la directora",
  revision: "Control de calidad: aprueba o devuelve",
};

type Nodo = { paso: PasoEquipo; carril: number; x: number; y: number; t: number };
type Flecha = { de: { x: number; y: number }; a: { x: number; y: number }; color: string; tipo: "entrega" | "consulta" | "respuesta" | "final" | "revision" };

/** A curve from one node to another, leaving and arriving horizontally. */
function curva(de: { x: number; y: number }, a: { x: number; y: number }) {
  const dx = Math.max(40, Math.abs(a.x - de.x) / 2);
  return `M ${de.x} ${de.y} C ${de.x + dx} ${de.y}, ${a.x - dx} ${a.y}, ${a.x} ${a.y}`;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * The team's whole process as a diagram: a lane per member, each task a node at the moment it happened, and animated
 * arrows for the work flowing between them (each analysis handed to the director, the director's questions and the
 * answers, and the final report). Hovering a node shows its card.
 */
export function FlujoEquipo({ pasos, enCurso }: { pasos: PasoEquipo[]; enCurso: boolean }) {
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(900);
  const [encima, setEncima] = useState<Nodo | null>(null);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const propios = pasos.filter((p) => p.quien && EQUIPO.some((m) => m.quien === p.quien));
  if (!propios.length)
    return <p className="rounded-lg border border-dashed border-white/[0.1] px-4 py-8 text-center text-sm text-ink-500">El diagrama aparece cuando el equipo trabaja en un informe.</p>;

  // Positions: x by time, pushed right when two nodes of the same lane would overlap.
  const t0 = Date.parse(propios[0].hora);
  const t1 = Date.parse(propios.at(-1)!.hora);
  const util = Math.max(560, ancho - ETIQUETAS - FINAL - 40);
  const director = EQUIPO.findIndex((m) => m.quien === "Director");
  // A node that receives work always sits to the right of the one sending it: the director starts after every hand-in,
  // an answer after its question, and the director goes on after the answer.
  const DESPUES = 64;
  const ultimoX = new Map<number, number>();
  const nodos: Nodo[] = [];
  let pendienteVuelta: number | null = null;
  const usadas = new Set<Nodo>();
  for (const p of propios) {
    const carril = EQUIPO.findIndex((m) => m.quien === p.quien);
    const t = Date.parse(p.hora);
    let x = Math.max(ETIQUETAS + 24 + ((t - t0) / Math.max(1, t1 - t0)) * util, (ultimoX.get(carril) ?? -Infinity) + SEPARACION);
    // The director's first node after hand-ins goes after them.
    if (carril === director) {
      const llegan = nodos.filter((n) => n.carril !== director && n.paso.tipo === "informe" && !usadas.has(n));
      if (llegan.length) x = Math.max(x, ...llegan.map((n) => n.x + DESPUES));
      llegan.forEach((n) => usadas.add(n));
    }
    // A member's first node after work is sent their way (a sent-back analysis, the reviewer's findings).
    const recibido = [...nodos].reverse().find((n) => n.paso.para === p.quien && n.paso.tipo === "revision" && !usadas.has(n));
    if (recibido) {
      x = Math.max(x, recibido.x + DESPUES);
      usadas.add(recibido);
    }
    // The reviewer starts after the director hands in the report.
    if (p.quien === "Revisor" && p.tipo === "inicio") {
      const entrega = [...nodos].reverse().find((n) => n.carril === director);
      if (entrega) x = Math.max(x, entrega.x + DESPUES);
    }
    if (p.tipo === "respuesta") {
      const pregunta = [...nodos].reverse().find((n) => n.paso.tipo === "consulta" && n.paso.para === p.quien);
      if (pregunta) x = Math.max(x, pregunta.x + DESPUES);
    }
    if (carril === director && pendienteVuelta !== null) {
      x = Math.max(x, pendienteVuelta + DESPUES);
      pendienteVuelta = null;
    }
    if (p.tipo === "respuesta") pendienteVuelta = x;
    ultimoX.set(carril, x);
    nodos.push({ paso: p, carril, x, y: ARRIBA + carril * CARRIL + CARRIL / 2, t });
  }
  const deDirector = nodos.filter((n) => n.carril === director);
  const finDirector = deDirector.find((n) => n.paso.tipo === "informe" && n === deDirector.at(-1));
  const maxX = Math.max(...nodos.map((n) => n.x));
  const informe = finDirector ? { x: finDirector.x + 110, y: finDirector.y } : null;
  const anchoTotal = Math.max(ancho, (informe ? informe.x + 150 : maxX + 60) + 20);
  const alto = ARRIBA * 2 + EQUIPO.length * CARRIL;

  const flechas: Flecha[] = [];
  // Each specialist's hand-in goes to the director.
  const revisor = EQUIPO.findIndex((m) => m.quien === "Revisor");
  for (const n of nodos) {
    if (n.carril === director || n.paso.tipo !== "informe") continue;
    // A specialist's hand-in goes to the director's next node; the reviewer's approval too.
    const destino = deDirector.find((d) => d.x > n.x);
    if (destino) flechas.push({ de: { x: n.x + NODO / 2, y: n.y }, a: { x: destino.x - NODO / 2, y: destino.y }, color: EQUIPO[n.carril].avatar.fondo, tipo: "entrega" });
  }
  for (const n of nodos.filter((x) => x.paso.tipo === "revision" && x.paso.para)) {
    // A score or the reviewer's findings go to the next node of whoever it's for (a redo, or the director fixing).
    const carrilPara = EQUIPO.findIndex((m) => m.quien === n.paso.para);
    const destino = nodos.find((d) => d.carril === carrilPara && d.x > n.x);
    if (destino && (n.carril === revisor || /^Devuelve/.test(n.paso.texto))) flechas.push({ de: { x: n.x + NODO / 2, y: n.y }, a: { x: destino.x - NODO / 2, y: destino.y }, color: "#fb7185", tipo: "revision" });
  }
  // The report goes to the reviewer.
  const aRevisar = nodos.find((n) => n.carril === revisor && n.paso.tipo === "inicio");
  const entregaDirector = aRevisar && [...deDirector].reverse().find((d) => d.x < aRevisar.x);
  if (aRevisar && entregaDirector) flechas.push({ de: { x: entregaDirector.x + NODO / 2, y: entregaDirector.y }, a: { x: aRevisar.x - NODO / 2, y: aRevisar.y }, color: EQUIPO[director].avatar.fondo, tipo: "entrega" });
  // Questions and answers.
  for (const c of nodos.filter((n) => n.paso.tipo === "consulta")) {
    const r = nodos.find((n) => n.paso.tipo === "respuesta" && n.paso.quien === c.paso.para && n.t >= c.t);
    if (!r) continue;
    flechas.push({ de: { x: c.x + NODO / 2, y: c.y }, a: { x: r.x - NODO / 2, y: r.y }, color: "#a78bfa", tipo: "consulta" });
    const vuelta = deDirector.find((n) => n.t >= r.t && n !== c);
    if (vuelta) flechas.push({ de: { x: r.x + NODO / 2, y: r.y }, a: { x: vuelta.x - NODO / 2, y: vuelta.y }, color: "#a78bfa", tipo: "respuesta" });
  }
  if (finDirector && informe) flechas.push({ de: { x: finDirector.x + NODO / 2, y: finDirector.y }, a: { x: informe.x - 4, y: informe.y }, color: "#22c55e", tipo: "final" });

  const colores = [...new Set(flechas.map((f) => f.color))];
  const idMarca = (c: string) => `punta-${c.replace("#", "")}`;

  return (
    <div className="flex flex-col gap-3">
      <style>{`@keyframes flujo-equipo { to { stroke-dashoffset: -24; } }`}</style>
      <div ref={caja} className="relative overflow-x-auto rounded-xl border border-white/[0.08] bg-ink-950">
        <div className="relative" style={{ width: anchoTotal, height: alto }}>
          {/* Grid background */}
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:28px_28px]" />

          {/* Lanes */}
          {EQUIPO.map((m, i) => (
            <div key={m.quien} className="absolute inset-x-0 flex items-center border-b border-white/[0.05]" style={{ top: ARRIBA + i * CARRIL, height: CARRIL }}>
              <div className="sticky left-0 z-20 flex h-full items-center gap-2.5 bg-gradient-to-r from-ink-950 via-ink-950 to-transparent pr-6 pl-3" style={{ width: ETIQUETAS }}>
                <AvatarAgente avatar={m.avatar} tamano={38} trabajando={enCurso && nodos.some((n) => n.carril === i) && !nodos.some((n) => n.carril === i && n.paso.tipo === "informe")} />
                <span className="min-w-0 text-xs">
                  <span className="block font-semibold text-ink-50">{m.persona}</span>
                  <span className="block truncate text-ink-500">{m.quien}</span>
                </span>
              </div>
            </div>
          ))}

          {/* Arrows */}
          <svg className="pointer-events-none absolute inset-0" width={anchoTotal} height={alto} aria-hidden>
            <defs>
              {colores.map((c) => (
                <marker key={c} id={idMarca(c)} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill={c} />
                </marker>
              ))}
              <filter id="brillo" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {/* Each member's own work: a line through their nodes */}
            {EQUIPO.map((m, i) => {
              const suyos = nodos.filter((n) => n.carril === i);
              if (suyos.length < 2) return null;
              return <polyline key={m.quien} points={suyos.map((n) => `${n.x},${n.y}`).join(" ")} fill="none" stroke={m.avatar.fondo} strokeOpacity="0.45" strokeWidth="2" />;
            })}
            {flechas.map((f, i) => (
              <path
                key={i}
                d={curva(f.de, f.a)}
                fill="none"
                stroke={f.color}
                strokeWidth={f.tipo === "final" ? 2.5 : 2}
                strokeDasharray="6 6"
                markerEnd={`url(#${idMarca(f.color)})`}
                filter="url(#brillo)"
                style={{ animation: "flujo-equipo 1.2s linear infinite" }}
              />
            ))}
          </svg>

          {/* Nodes */}
          {nodos.map((n, i) => (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setEncima(n)}
              onMouseLeave={() => setEncima((e) => (e === n ? null : e))}
              onFocus={() => setEncima(n)}
              onBlur={() => setEncima(null)}
              aria-label={`${EQUIPO[n.carril].persona}: ${n.paso.texto}`}
              className="absolute z-10 flex items-center justify-center rounded-full border-2 text-[11px] font-bold text-ink-950 transition-transform hover:scale-125"
              style={{ left: n.x - NODO / 2, top: n.y - NODO / 2, width: NODO, height: NODO, background: COLOR_TIPO[n.paso.tipo], borderColor: "#0b0b0f", boxShadow: `0 0 12px ${COLOR_TIPO[n.paso.tipo]}66` }}
            >
              {ICONO[n.paso.tipo]}
            </button>
          ))}

          {/* Final report card */}
          {informe && (
            <div className="absolute z-10 flex items-center gap-2 rounded-xl border border-success/50 bg-success/10 px-3 py-2 shadow-[0_0_20px_rgba(34,197,94,0.25)]" style={{ left: informe.x, top: informe.y - 22 }}>
              <span className="text-lg">📄</span>
              <span className="text-xs">
                <span className="block font-bold text-success">Informe final</span>
                <span className="text-ink-400">listo en Conclusiones</span>
              </span>
            </div>
          )}

          {/* Card of the hovered node */}
          {encima && (
            <div
              className="pointer-events-none absolute z-30 w-64 rounded-xl border border-white/10 bg-ink-900/95 p-3 text-xs shadow-2xl backdrop-blur"
              style={{ left: Math.min(encima.x + 18, anchoTotal - 270), top: encima.y + (encima.carril >= EQUIPO.length - 2 ? -110 : 18) }}
            >
              <p className="flex items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-ink-950" style={{ background: COLOR_TIPO[encima.paso.tipo] }}>
                  {NOMBRE_TIPO[encima.paso.tipo]}
                </span>
                <span className="tabular text-ink-500">{hora(encima.paso.hora)}</span>
              </p>
              <p className="mt-1.5 font-semibold text-ink-50">{EQUIPO[encima.carril].persona}</p>
              <p className="mt-0.5 leading-snug text-ink-200">{encima.paso.texto}</p>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-ink-400">
        {(["inicio", "estudio", "web", "consulta", "respuesta", "revision", "informe"] as const).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className="flex size-4 items-center justify-center rounded-full text-[9px] font-bold text-ink-950" style={{ background: COLOR_TIPO[t] }}>
              {ICONO[t]}
            </span>
            {NOMBRE_TIPO[t]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-6 border-t-2 border-dashed border-ink-300" /> El trabajo pasa de uno a otro
        </span>
      </div>
    </div>
  );
}
