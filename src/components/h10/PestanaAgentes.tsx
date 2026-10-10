"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { InformeEstrategico, PasoEquipo, TrabajoEquipo } from "@/lib/datos/h10Tipos";
import type { EstadoInforme } from "@/lib/ia/agenteInforme";
import { EQUIPO, type MiembroEquipo } from "@/lib/datos/h10Equipo";
import { Markdown } from "@/components/chat/Markdown";
import { AvatarAgente } from "./AvatarAgente";
import { FlujoEquipo } from "./FlujoEquipo";

const CADA_MS = 1500;

/** «3 min 20 s», «45 s». */
function duracion(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}` : `${s} s`;
}
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const ICONO: Record<PasoEquipo["tipo"], { icono: string; clase: string }> = {
  inicio: { icono: "▶", clase: "bg-accent-500/15 text-accent-300" },
  estudio: { icono: "▤", clase: "bg-serie-ventas/15 text-serie-ventas" },
  web: { icono: "↗", clase: "bg-success/15 text-success" },
  informe: { icono: "✓", clase: "bg-success/20 text-success" },
  aviso: { icono: "!", clase: "bg-warning/15 text-warning" },
  consulta: { icono: "?", clase: "bg-violet-500/20 text-violet-300" },
  respuesta: { icono: "↩", clase: "bg-violet-500/20 text-violet-300" },
};

/** One member's work: steps, start and end, how long and how many web searches. */
function trabajoDe(m: MiembroEquipo, pasos: PasoEquipo[], ahora: number, enCurso: boolean) {
  const suyos = pasos.filter((p) => p.quien === m.quien);
  const inicio = suyos[0] ? Date.parse(suyos[0].hora) : null;
  const termino = suyos.some((p) => p.tipo === "informe");
  const fin = suyos.length ? (termino || !enCurso ? Date.parse(suyos.at(-1)!.hora) : ahora) : null;
  return { suyos, inicio, fin, termino, trabajando: enCurso && suyos.length > 0 && !termino, web: suyos.filter((p) => p.tipo === "web").length };
}

/**
 * «Agentes»: the research team as people. Each member with their portrait, job, status and time; a timeline of who
 * worked when (the four specialists at once, then the director); and a column of task cards per member, with their
 * full analysis. Live while the team works, and kept with the report afterwards.
 */
export function PestanaAgentes({ estudioId, informe }: { estudioId: string; informe: InformeEstrategico | null }) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoInforme | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const url = `/api/h10/estudios/${estudioId}/informe`;

  const seguir = useCallback(async () => {
    for (;;) {
      await new Promise((ok) => setTimeout(ok, CADA_MS));
      const j = await fetch(url).then((r) => r.json()).catch(() => null);
      const e: EstadoInforme | null = j?.estado ?? null;
      setEstado(e);
      setAhora(Date.now());
      if (!e || e.terminado) {
        router.refresh();
        return;
      }
    }
  }, [url, router]);

  useEffect(() => {
    let vivo = true;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (vivo && j?.estado && !j.estado.terminado) {
          setEstado(j.estado);
          void seguir();
        }
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [url, seguir]);

  const enCurso = !!estado && !estado.terminado;
  const trabajo: TrabajoEquipo | null = informe?.trabajo ?? null;
  const pasos = enCurso ? estado.pasos : (trabajo?.pasos ?? []);
  const inicio = enCurso ? Date.parse(estado.empezado) : trabajo ? Date.parse(trabajo.empezado) : null;
  const fin = enCurso ? ahora : trabajo ? Date.parse(trabajo.terminado) : null;
  const total = inicio !== null && fin !== null ? Math.max(1, fin - inicio) : null;
  const gasto = enCurso ? estado.gasto : trabajo?.gasto;
  const modo = enCurso ? estado.modo : trabajo?.modo;
  const miembros = EQUIPO.map((m) => ({ m, t: trabajoDe(m, pasos, ahora, enCurso) }));

  return (
    <div className="flex flex-col gap-4">
      {/* The team at a glance */}
      <section className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-ink-900 to-ink-950 p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.2em] text-accent-400 uppercase">Tu equipo de análisis</p>
            <h2 className="mt-1 text-xl font-bold text-ink-50">{enCurso ? "Están trabajando en tu informe" : trabajo ? "Así trabajaron en el último informe" : "5 personas listas para estudiar tu producto"}</h2>
            <p className="mt-1 text-sm text-ink-400">
              {enCurso || trabajo
                ? `${total ? duracion(total) : "—"} en total${gasto ? ` · ${gasto.dolares.toLocaleString("es-ES", { maximumFractionDigits: 3 })} $` : ""}${gasto?.busquedasWeb ? ` · ${gasto.busquedasWeb} búsquedas en internet` : ""}${modo === "ensayo" ? " · ensayo, sin IA" : ""}`
                : "Cuatro especialistas trabajan a la vez y la directora une su trabajo. Pide el informe en «Conclusiones»."}
            </p>
          </div>
          {enCurso && <span className="animate-pulse rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">● En directo</span>}
        </div>
        <div className="mt-5 flex flex-wrap gap-4">
          {miembros.map(({ m, t }) => (
            <div key={m.quien} className="flex items-center gap-3">
              <AvatarAgente avatar={m.avatar} tamano={48} trabajando={t.trabajando} />
              <span className="text-sm">
                <span className="block font-semibold text-ink-50">{m.persona}</span>
                <span className="block text-xs text-ink-400">{m.puesto}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Timeline: who worked when */}
      <section className="rounded-xl border border-white/[0.06] bg-ink-900/80 p-4 shadow-soft">
        <h3 className="text-base font-semibold text-ink-100">Línea de tiempo</h3>
        <p className="text-xs text-ink-400">{total ? "Cuándo trabajó cada uno: los cuatro especialistas a la vez y después la directora" : "Tiempo que suele tardar cada uno con todos los datos de un producto"}</p>
        <div className="mt-4 flex flex-col gap-2.5">
          {miembros.map(({ m, t }) => {
            const izq = total && t.inicio !== null && inicio !== null ? ((t.inicio - inicio) / total) * 100 : null;
            const ancho = total && t.inicio !== null && t.fin !== null ? Math.max(1.5, ((t.fin - t.inicio) / total) * 100) : null;
            return (
              <div key={m.quien} className="grid grid-cols-[110px_1fr_90px] items-center gap-3 text-sm sm:grid-cols-[160px_1fr_110px]">
                <span className="truncate text-ink-200">
                  {m.persona} <span className="text-xs text-ink-500">· {m.quien}</span>
                </span>
                <span className="relative h-6 overflow-hidden rounded-md bg-white/[0.04]">
                  {izq !== null && ancho !== null ? (
                    <span className={`absolute inset-y-0 rounded-md ${t.trabajando ? "animate-pulse" : ""}`} style={{ left: `${izq}%`, width: `${ancho}%`, background: m.avatar.fondo }} />
                  ) : (
                    !total && <span className="absolute inset-y-1 left-1 rounded-sm opacity-40" style={{ width: `${(m.minutos[1] / 30) * 100}%`, background: m.avatar.fondo }} />
                  )}
                </span>
                <span className="tabular text-right text-xs text-ink-300">
                  {t.inicio !== null && t.fin !== null ? duracion(t.fin - t.inicio) : `${m.minutos[0]}–${m.minutos[1]} min`}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* The whole process as a diagram */}
      <section className="rounded-xl border border-white/[0.06] bg-ink-900/80 p-4 shadow-soft">
        <h3 className="text-base font-semibold text-ink-100">Cómo trabajaron: el proceso completo</h3>
        <p className="mb-3 text-xs text-ink-400">Cada punto es una tarea en el momento en que la hicieron; las flechas, el trabajo que pasa de uno a otro. Pasa el ratón por un punto para ver qué hizo.</p>
        <FlujoEquipo pasos={pasos} enCurso={enCurso} />
      </section>

      {/* A column of task cards per member */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {miembros.map(({ m, t }) => {
          const analisis = trabajo?.analisis.find((a) => a.especialista === m.quien);
          return (
            <section key={m.quien} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-ink-900/80 shadow-soft">
              <header className="flex items-center gap-3 border-b border-white/[0.06] p-3" style={{ background: `linear-gradient(135deg, ${m.avatar.fondo}26, transparent)` }}>
                <AvatarAgente avatar={m.avatar} tamano={44} trabajando={t.trabajando} />
                <span className="min-w-0">
                  <span className="block font-semibold text-ink-50">{m.persona}</span>
                  <span className="block truncate text-xs text-ink-400">{m.puesto}</span>
                </span>
              </header>
              <div className="flex flex-wrap gap-1.5 px-3 pt-3 text-[11px]">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${t.termino ? "bg-success/15 text-success" : t.trabajando ? "bg-accent-500/15 text-accent-300" : "bg-white/[0.06] text-ink-400"}`}>
                  {t.termino ? "✓ Terminado" : t.trabajando ? "Trabajando…" : "Esperando"}
                </span>
                {t.inicio !== null && t.fin !== null && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-ink-300">{duracion(t.fin - t.inicio)}</span>}
                {t.suyos.length > 0 && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-ink-300">{t.suyos.length} tareas</span>}
                {t.web > 0 && <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">{t.web} en internet</span>}
              </div>
              <p className="px-3 pt-2 text-xs text-ink-400">{m.descripcion}</p>
              <ol className="flex max-h-96 flex-col gap-1.5 overflow-y-auto p-3">
                {t.suyos.length === 0 && <li className="rounded-lg border border-dashed border-white/[0.1] px-3 py-4 text-center text-xs text-ink-500">Sin tareas todavía</li>}
                {t.suyos.map((p, i) => {
                  const siguiente = t.suyos[i + 1];
                  const ultimo = i === t.suyos.length - 1;
                  const dura = siguiente ? Date.parse(siguiente.hora) - Date.parse(p.hora) : t.trabajando && ultimo ? ahora - Date.parse(p.hora) : null;
                  const ic = ICONO[p.tipo];
                  return (
                    <li key={i} className={`flex gap-2 rounded-lg border px-2.5 py-2 text-xs ${t.trabajando && ultimo ? "border-accent-500/40 bg-accent-500/[0.06]" : "border-white/[0.06] bg-ink-950/40"}`}>
                      <span className={`flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${ic.clase}`}>{ic.icono}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-ink-100">{p.texto}</span>
                        <span className="tabular text-[10px] text-ink-500">
                          {hora(p.hora)}
                          {dura !== null && dura > 0 ? ` · ${duracion(dura)}` : ""}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
              {analisis && (
                <details className="mt-auto border-t border-white/[0.06] px-3 py-2.5 text-xs">
                  <summary className="cursor-pointer font-semibold text-accent-300 hover:text-accent-400">Ver su análisis</summary>
                  <div className="mt-2 max-h-96 overflow-y-auto text-[13px] leading-relaxed text-ink-200">
                    <Markdown texto={analisis.analisis} />
                    {analisis.fuentes.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {analisis.fuentes.map((f) => (
                          <li key={f.url}>
                            <a href={f.url} target="_blank" rel="noreferrer" className="text-accent-300 hover:underline">
                              {f.titulo} ↗
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
