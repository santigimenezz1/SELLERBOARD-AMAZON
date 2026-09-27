"use client";

import { useState } from "react";
import type { ClaveCategoria, EstadoMercado } from "@/lib/datos/estadoCuenta";
import type { ProblemaProducto } from "@/lib/datos/saludListings";
import { formatFechaHora, formatNumero } from "@/lib/format";
import { Bandera } from "@/components/Bandera";
import type { EstadoNotificaciones } from "@/lib/datos/notificaciones";
import { Notificaciones } from "./Notificaciones";

export type Mercado = { id: string; pais: string; codigoPais: string };
type Categoria = { clave: ClaveCategoria; texto: string };

type Props = {
  mercados: Mercado[];
  estados: Record<string, EstadoMercado>;
  categorias: readonly Categoria[];
  normativos: Record<string, ProblemaProducto[]>;
  actualizadoEn: string | null;
  notificaciones: EstadoNotificaciones;
};

// Amazon's rating bands, shown with Seller Central's words.
const BANDAS: Record<string, { texto: string; clase: string }> = {
  GREAT: { texto: "Adecuado", clase: "bg-success text-ink-950" },
  GOOD: { texto: "Adecuado", clase: "bg-success text-ink-950" },
  HEALTHY: { texto: "Adecuado", clase: "bg-success text-ink-950" },
  FAIR: { texto: "Mejorable", clase: "bg-warning text-ink-950" },
  AT_RISK: { texto: "En riesgo", clase: "bg-warning text-ink-950" },
  CRITICAL: { texto: "Crítico", clase: "bg-danger text-white" },
  UNHEALTHY: { texto: "Crítico", clase: "bg-danger text-white" },
};
const ESTADOS_CUENTA: Record<string, string> = { NORMAL: "Normal", AT_RISK: "En riesgo", DEACTIVATED: "Desactivada" };

/** Seller Central's scale isn't linear: 0–100 and 100–200 get as much room as 200–1000. */
function posicion(p: number): number {
  const v = Math.max(0, Math.min(1000, p));
  if (v <= 100) return (v / 100) * 25;
  if (v <= 200) return 25 + ((v - 100) / 100) * 30;
  return 55 + ((v - 200) / 800) * 45;
}

/** Something to review in this marketplace: bad rating/status, any policy issue, compliance issue or notification. */
export function necesitaRevision(e: EstadoMercado | undefined, normativos: number, pendientes: number): boolean {
  if (normativos > 0 || pendientes > 0) return true;
  if (!e) return false;
  const bandaOk = !e.estadoPuntuacion || ["GREAT", "GOOD", "HEALTHY"].includes(e.estadoPuntuacion);
  return (e.estado !== null && e.estado !== "NORMAL") || !bandaOk || e.avisos > 0 || Object.values(e.categorias).some((n) => n > 0);
}

function Cumplimiento({ e, categorias, normativos }: { e: EstadoMercado | undefined; categorias: readonly Categoria[]; normativos: ProblemaProducto[] }) {
  const [abierta, setAbierta] = useState(true);
  const [verNormativos, setVerNormativos] = useState(false);
  if (!e) {
    return <p className="rounded-xl border border-white/[0.06] bg-ink-900/70 px-4 py-10 text-center text-sm text-ink-400">Aún no hay datos de este país. Se traen en la próxima sincronización.</p>;
  }
  const banda = e.estadoPuntuacion ? (BANDAS[e.estadoPuntuacion] ?? { texto: e.estadoPuntuacion, clase: "bg-white/10 text-ink-100" }) : null;
  // Only the rows Seller Central shows, plus document requests when there are any.
  const filas = categorias.filter((c) => c.clave !== "documentRequests" || e.categorias[c.clave] > 0);

  return (
    <article className="overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
      <header className="flex items-center justify-between gap-3 px-5 py-3 text-white" style={{ background: "#2c90b6" }}>
        <h2 className="text-base leading-tight font-semibold">Cumplimiento de políticas</h2>
        {banda && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${banda.clase}`}>{banda.texto}</span>}
      </header>

      <div className="grid gap-4 border-b border-white/[0.06] bg-white/[0.02] px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] sm:items-center">
        <div>
          <p className="text-sm font-semibold text-ink-100">Nivel del estado de la cuenta</p>
          <p className="mt-0.5 text-xs text-ink-400">
            Esta valoración informa de tu cumplimiento con las políticas de venta de Amazon.
            {e.estado && ` Estado de la cuenta: ${ESTADOS_CUENTA[e.estado] ?? e.estado}.`}
          </p>
        </div>
        {e.puntuacion !== null && (
          <div>
            <p className="tabular text-lg font-semibold text-ink-100">{formatNumero(e.puntuacion)}</p>
            <div className="relative mt-1 h-2 rounded-full bg-white/[0.08]" role="img" aria-label={`Nivel ${e.puntuacion} de 1000`}>
              <div className="absolute inset-y-0 left-0 rounded-full bg-success" style={{ width: `${posicion(e.puntuacion)}%` }} />
              {[25, 55].map((x) => (
                <span key={x} aria-hidden className="absolute inset-y-[-2px] w-[3px] bg-ink-900" style={{ left: `${x}%` }} />
              ))}
            </div>
            <div className="tabular relative mt-1 h-4 text-[11px] text-ink-400">
              {[
                ["0", 0],
                ["100", 25],
                ["200", 55],
                ["1000", 100],
              ].map(([t, x]) => (
                <span key={t} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${x}%` }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <button onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-white/[0.02]">
        <span className="text-sm font-semibold text-ink-100">Todas las incidencias</span>
        <svg viewBox="0 0 16 16" className={`size-4 text-ink-300 transition-transform ${abierta ? "rotate-180" : ""}`} aria-hidden>
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {abierta && (
        <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
          {filas.map((c) => (
            <Fila key={c.clave} texto={c.texto} n={e.categorias[c.clave]} />
          ))}
          <Fila texto="Cumplimiento normativo" n={normativos.length} onClick={normativos.length ? () => setVerNormativos((v) => !v) : undefined} abierta={verNormativos} />
          {verNormativos &&
            normativos.map((p, i) => (
              <li key={i} className="bg-danger/[0.05] px-5 py-2.5 text-xs leading-snug text-ink-300">
                <span className="font-semibold text-danger">{p.severidad === "ERROR" ? "Error" : "Aviso"}</span> · {p.mensaje}
                <span className="mt-0.5 block text-[11px] text-ink-500">SKU {p.sku}</span>
              </li>
            ))}
        </ul>
      )}
      {(e.desde || e.hasta) && (
        <p className="border-t border-white/[0.06] px-5 py-2.5 text-[11px] text-ink-500">
          Periodo de Amazon: {e.desde?.slice(0, 10).split("-").reverse().join("/")} – {e.hasta?.slice(0, 10).split("-").reverse().join("/")}
        </p>
      )}
    </article>
  );
}

function Fila({ texto, n, onClick, abierta }: { texto: string; n: number; onClick?: () => void; abierta?: boolean }) {
  const contenido = (
    <>
      <span className={`text-sm ${n > 0 ? "text-ink-100" : "text-ink-300"}`}>
        {texto}
        {onClick && <span className="ml-2 text-xs text-ink-500">{abierta ? "Ocultar" : "Ver detalle"}</span>}
      </span>
      <span className="flex items-center gap-2">
        {n > 0 && (
          <span aria-label="Requiere atención" className="grid size-4 place-items-center rounded-full bg-danger text-[10px] font-bold text-white">
            !
          </span>
        )}
        <span className={`tabular text-lg ${n > 0 ? "font-semibold text-danger" : "text-ink-100"}`}>{n}</span>
      </span>
    </>
  );
  return (
    <li>
      {onClick ? (
        <button onClick={onClick} aria-expanded={abierta} className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-white/[0.02]">
          {contenido}
        </button>
      ) : (
        <div className="flex items-center justify-between gap-3 px-5 py-2.5">{contenido}</div>
      )}
    </li>
  );
}

/** Account health page: country switch on top, «Estado de la cuenta» and «Notificaciones de performance» tabs. */
export function VistaCuenta({ mercados, estados, categorias, normativos, actualizadoEn, notificaciones }: Props) {
  // Unread notifications per marketplace (account-wide ones count for every country).
  const pendientes: Record<string, number> = {};
  for (const m of mercados) pendientes[m.id] = notificaciones.notificaciones.filter((n) => !n.leida && (n.marketplaceId === m.id || n.marketplaceId === null)).length;
  const [mkId, setMkId] = useState(mercados[0]?.id ?? "");
  const [pestana, setPestana] = useState<"estado" | "notificaciones">("estado");
  const mercado = mercados.find((m) => m.id === mkId) ?? mercados[0];
  const revisar = (m: Mercado) => necesitaRevision(estados[m.id], normativos[m.id]?.length ?? 0, pendientes[m.id] ?? 0);
  const otrosConAvisos = mercados.filter((m) => m.id !== mercado?.id && revisar(m));

  if (!mercado) return <p className="text-sm text-ink-400">Aún no hay países con ventas.</p>;

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="País" className="flex flex-wrap gap-1.5">
        {mercados.map((m) => {
          const activo = m.id === mercado.id;
          return (
            <button
              key={m.id}
              onClick={() => setMkId(m.id)}
              aria-pressed={activo}
              className={`relative inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${activo ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:border-white/[0.16] hover:text-ink-100"}`}
            >
              <Bandera codigo={m.codigoPais} className="text-base" />
              {m.pais}
              {revisar(m) && <span aria-label="Hay algo para revisar" className="absolute -top-1 -right-1 size-2.5 rounded-full bg-danger ring-2 ring-ink-950" />}
            </button>
          );
        })}
      </nav>

      {otrosConAvisos.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/30 bg-danger/[0.07] px-3 py-2 text-sm text-danger">
          Hay algo para revisar en:
          {otrosConAvisos.map((m) => (
            <button key={m.id} onClick={() => setMkId(m.id)} className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline">
              <Bandera codigo={m.codigoPais} />
              {m.pais}
            </button>
          ))}
        </p>
      )}

      <div role="tablist" aria-label="Apartado" className="flex gap-6 border-b border-white/[0.08]">
        {(
          [
            ["estado", "Estado de la cuenta", 0],
            ["notificaciones", "Notificaciones de performance", pendientes[mercado.id] ?? 0],
          ] as const
        ).map(([id, texto, n]) => (
          <button
            key={id}
            role="tab"
            aria-selected={pestana === id}
            onClick={() => setPestana(id)}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 pb-2.5 text-sm font-semibold transition-colors ${pestana === id ? "border-accent-400 text-accent-300" : "border-transparent text-ink-300 hover:text-ink-100"}`}
          >
            {texto}
            {n > 0 && <span className="rounded-full bg-danger px-1.5 text-[11px] leading-4 font-bold text-white">{n}</span>}
          </button>
        ))}
      </div>

      {pestana === "estado" ? (
        <div className="max-w-3xl">
          <Cumplimiento key={mercado.id} e={estados[mercado.id]} categorias={categorias} normativos={normativos[mercado.id] ?? []} />
          <p className="mt-2 text-[11px] text-ink-500">
            Datos del informe de rendimiento de Amazon{actualizadoEn ? `, actualizado ${formatFechaHora(new Date(actualizadoEn))}` : ""}. «Cumplimiento normativo» sale de los avisos de tus
            listings.
          </p>
        </div>
      ) : (
        <Notificaciones datos={notificaciones} marketplaceId={mercado.id} pais={mercado.pais} />
      )}
    </div>
  );
}
