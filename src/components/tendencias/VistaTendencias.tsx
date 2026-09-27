"use client";

import { useMemo, useState } from "react";
import type { DatosTendencias } from "@/lib/datos/tendencias";
import { formatNumero } from "@/lib/format";
import { Bandera } from "@/components/Bandera";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const FRANJAS = [
  { nombre: "Madrugada", desde: 0, hasta: 7 },
  { nombre: "Mañana", desde: 7, hasta: 13 },
  { nombre: "Mediodía", desde: 13, hasta: 16 },
  { nombre: "Tarde", desde: 16, hasta: 20 },
  { nombre: "Noche", desde: 20, hasta: 24 },
];
const BLOQUES = [0, 4, 8, 12, 16, 20];
const PERIODOS = [
  { dias: 30, nombre: "30 días" },
  { dias: 90, nombre: "90 días" },
  { dias: 0, nombre: "Todo" },
];
const DIA_MS = 86_400_000;

// Weekday (0 = Monday) and hour of a moment in a time zone. Formatters are reused: creating them is slow.
const formateadores = new Map<string, Intl.DateTimeFormat>();
function diaYHora(t: number, zona: string): [number, number] {
  let f = formateadores.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: zona, weekday: "short", hour: "numeric", hourCycle: "h23" });
    formateadores.set(zona, f);
  }
  const partes = f.formatToParts(new Date(t));
  const dia = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(partes.find((p) => p.type === "weekday")?.value ?? "Mon");
  return [dia, Number(partes.find((p) => p.type === "hour")?.value ?? 0)];
}

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
const uds = (n: number) => `${formatNumero(n)} ${n === 1 ? "ud" : "uds"}`;

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${activo ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:border-white/[0.16] hover:text-ink-100"}`}
    >
      {children}
    </button>
  );
}

function Tarjeta({ titulo, subtitulo, className = "", children }: { titulo: string; subtitulo: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-xl border border-white/[0.06] bg-ink-900/80 p-4 shadow-soft ${className}`}>
      <h2 className="text-sm font-semibold text-ink-100">{titulo}</h2>
      <p className="mb-3 text-xs text-ink-400">{subtitulo}</p>
      {children}
    </section>
  );
}

/** «Tendencias»: when buyers purchase, by time of day and weekday, in their local time. */
export function VistaTendencias({ datos }: { datos: DatosTendencias }) {
  const [dias, setDias] = useState(90);
  const [asin, setAsin] = useState<string | null>(null);
  const [mk, setMk] = useState<string | null>(null);
  const zonas = useMemo(() => new Map(datos.paises.map((p) => [p.id, p.zona])), [datos.paises]);

  const r = useMemo(() => {
    const desde = dias ? datos.generadoEn - dias * DIA_MS : -Infinity;
    // units[weekday][hour]
    const matriz = DIAS.map(() => Array<number>(24).fill(0));
    let total = 0;
    for (const v of datos.ventas) {
      if (v.t < desde || (asin && v.asin !== asin) || (mk && v.mk !== mk)) continue;
      const [d, h] = diaYHora(v.t, zonas.get(v.mk) ?? "Europe/Madrid");
      matriz[d][h] += v.u;
      total += v.u;
    }
    const porHora = Array.from({ length: 24 }, (_, h) => matriz.reduce((s, fila) => s + fila[h], 0));
    const franjas = FRANJAS.map((f) => ({ ...f, n: porHora.slice(f.desde, f.hasta).reduce((a, b) => a + b, 0) }));
    const porDia = matriz.map((fila) => fila.reduce((a, b) => a + b, 0));
    const bloques = matriz.map((fila) => BLOQUES.map((b) => fila.slice(b, b + 4).reduce((a, x) => a + x, 0)));
    const ranking = matriz
      .flatMap((fila, d) => fila.map((n, h) => ({ d, h, n })))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);
    return { total, franjas, porDia, bloques, ranking };
  }, [datos.ventas, datos.generadoEn, dias, asin, mk, zonas]);

  const maxFranja = Math.max(1, ...r.franjas.map((f) => f.n));
  const maxDia = Math.max(1, ...r.porDia);
  const maxBloque = Math.max(1, ...r.bloques.flat());

  return (
    <div className="flex flex-col gap-5">
      {/* Filters */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {PERIODOS.map((p) => (
            <Chip key={p.dias} activo={dias === p.dias} onClick={() => setDias(p.dias)}>
              {p.nombre}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip activo={asin === null} onClick={() => setAsin(null)}>
            Todos los listings
          </Chip>
          {datos.listings.map((l) => (
            <Chip key={l.asin} activo={asin === l.asin} onClick={() => setAsin(l.asin)}>
              {l.nombre}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip activo={mk === null} onClick={() => setMk(null)}>
            Todos los países
          </Chip>
          {datos.paises.map((p) => (
            <Chip key={p.id} activo={mk === p.id} onClick={() => setMk(p.id)}>
              <Bandera codigo={p.codigoPais} />
              {p.pais}
            </Chip>
          ))}
        </div>
        <p className="text-xs text-ink-400">
          {r.total > 0 ? `${uds(r.total)} en el periodo.` : "Sin ventas con estos filtros."} Horas en la hora local del comprador.
        </p>
      </div>

      {r.total > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* 1. The direct answer */}
          <Tarjeta titulo="Mejores momentos de la semana" subtitulo="Los 5 días y horas con más unidades vendidas">
            <ol className="divide-y divide-white/[0.05]">
              {r.ranking.map((x, i) => (
                <li key={`${x.d}-${x.h}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex items-center gap-3">
                    <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${i === 0 ? "bg-accent-500 text-ink-950" : "bg-white/[0.06] text-ink-300"}`}>{i + 1}</span>
                    <span className="text-ink-100">
                      {DIAS[x.d]}, {x.h}–{x.h + 1} h
                    </span>
                  </span>
                  <span className="tabular font-semibold text-accent-300">{uds(x.n)}</span>
                </li>
              ))}
            </ol>
          </Tarjeta>

          {/* 2. Time of day */}
          <Tarjeta titulo="¿En qué momento del día se vende?" subtitulo="% de las unidades por franja horaria">
            <div className="flex flex-col gap-2.5">
              {r.franjas.map((f) => (
                <div key={f.nombre} className="grid grid-cols-[130px_1fr_48px] items-center gap-3 text-sm">
                  <span className="text-ink-300">
                    {f.nombre} <span className="text-xs text-ink-500">({f.desde}–{f.hasta} h)</span>
                  </span>
                  <div className="h-5 overflow-hidden rounded bg-white/[0.05]">
                    <div className={`h-full rounded ${f.n === maxFranja ? "bg-accent-500" : "bg-accent-500/45"}`} style={{ width: `${(f.n / maxFranja) * 100}%` }} />
                  </div>
                  <span className="tabular text-right font-semibold text-ink-100">{pct(f.n, r.total)} %</span>
                </div>
              ))}
            </div>
          </Tarjeta>

          {/* 3. Weekday */}
          <Tarjeta titulo="¿Qué día se vende más?" subtitulo="Unidades por día de la semana">
            <div className="flex h-40 items-end gap-2">
              {r.porDia.map((n, d) => (
                <div key={d} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="tabular text-xs font-semibold text-ink-100">{formatNumero(n)}</span>
                  <div className={`w-full rounded-t ${n === maxDia ? "bg-accent-500" : "bg-accent-500/45"}`} style={{ height: `${(n / maxDia) * 78}%` }} />
                  <span className="text-xs text-ink-400">{DIAS_CORTOS[d]}</span>
                </div>
              ))}
            </div>
          </Tarjeta>

          {/* 4. Week at a glance */}
          <Tarjeta titulo="La semana por bloques de 4 horas" subtitulo="Unidades en cada día y franja; más intenso = más ventas">
            <div className="grid grid-cols-[40px_repeat(6,1fr)] gap-1 text-xs">
              <div />
              {BLOQUES.map((b) => (
                <div key={b} className="text-center text-ink-400">
                  {b}–{b + 4}
                </div>
              ))}
              {r.bloques.map((fila, d) => (
                <div key={d} className="contents">
                  <div className="flex items-center text-ink-400">{DIAS_CORTOS[d]}</div>
                  {fila.map((n, i) => (
                    <div key={i} className="relative grid h-8 place-items-center overflow-hidden rounded">
                      <div aria-hidden className="absolute inset-0 bg-accent-500" style={{ opacity: n ? 0.1 + (n / maxBloque) * 0.8 : 0.04 }} />
                      <span className={`tabular relative font-semibold ${n / maxBloque > 0.6 ? "text-ink-950" : "text-ink-100"}`}>{n || ""}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Tarjeta>
        </div>
      )}
    </div>
  );
}
