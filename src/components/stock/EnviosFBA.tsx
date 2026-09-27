"use client";

import { useState } from "react";
import type { EnvioGuardado } from "@/lib/datos/envios";
import { formatNumero } from "@/lib/format";
import { Bandera } from "@/components/Bandera";

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  WORKING: { texto: "En preparación", clase: "bg-white/[0.06] text-ink-300" },
  READY_TO_SHIP: { texto: "Listo para enviar", clase: "bg-white/[0.06] text-ink-300" },
  SHIPPED: { texto: "Enviado", clase: "bg-accent-500/15 text-accent-300" },
  IN_TRANSIT: { texto: "En tránsito", clase: "bg-accent-500/15 text-accent-300" },
  DELIVERED: { texto: "Entregado", clase: "bg-accent-500/15 text-accent-300" },
  CHECKED_IN: { texto: "Registrado en almacén", clase: "bg-warning/15 text-warning" },
  RECEIVING: { texto: "Recibiendo", clase: "bg-warning/15 text-warning" },
  CLOSED: { texto: "Cerrado", clase: "bg-success/15 text-success" },
  CANCELLED: { texto: "Cancelado", clase: "bg-white/[0.04] text-ink-500" },
  ERROR: { texto: "Error", clase: "bg-danger/15 text-danger" },
};
const FINALES = new Set(["CLOSED", "CANCELLED", "DELETED"]);
const FILAS_PLEGADA = 4;

const suma = (e: EnvioGuardado, k: "enviado" | "recibido") => e.articulos.reduce((s, a) => s + a[k], 0);
const fecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "—");

function Tabla({ envios }: { envios: EnvioGuardado[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-xs text-ink-400">
            <th className="py-2.5 pr-3 pl-5 text-left font-medium">Envío</th>
            <th className="px-3 py-2.5 text-left font-medium">Ruta</th>
            <th className="px-3 py-2.5 text-left font-medium">Estado</th>
            <th className="px-3 py-2.5 text-left font-medium">SKU</th>
            <th className="px-3 py-2.5 text-right font-medium">Enviadas</th>
            <th className="px-3 py-2.5 text-right font-medium">Recibidas</th>
            <th className="py-2.5 pr-5 pl-3 text-right font-medium">Diferencia</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {envios.map((e) => {
            const enviado = suma(e, "enviado");
            const recibido = suma(e, "recibido");
            const cancelado = e.estado === "CANCELLED";
            const cerrado = e.estado === "CLOSED";
            const dif = recibido - enviado;
            const est = ESTADOS[e.estado] ?? { texto: e.estado, clase: "bg-white/[0.06] text-ink-300" };
            return (
              <tr key={e.id} className={cancelado ? "text-ink-500" : ""}>
                <td className="py-2.5 pr-3 pl-5 align-top">
                  <p className="font-mono text-ink-100">{e.id}</p>
                  <p className="text-xs text-ink-400">Creado {fecha(e.creado)}</p>
                </td>
                <td className="px-3 py-2.5 align-top whitespace-nowrap text-ink-300">
                  <span className="inline-flex items-center gap-1.5">
                    {e.paisOrigen && <Bandera codigo={e.paisOrigen} />}
                    <span aria-hidden>→</span>
                    <span aria-hidden className={`fi fi-${e.region === "uk" ? "gb" : "eu"} rounded-[2px]`} />
                    <span className="font-mono text-xs">{e.centro}</span>
                  </span>
                  <p className="text-xs text-ink-400">{e.region === "uk" ? "Reino Unido" : "Europa"}</p>
                </td>
                <td className="px-3 py-2.5 align-top">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${est.clase}`}>{est.texto}</span>
                </td>
                <td className="px-3 py-2.5 align-top">
                  {e.articulos.map((a) => (
                    <p key={a.sku} className="font-mono text-xs text-ink-300">
                      {a.sku}
                      {e.articulos.length > 1 && <span className="ml-1.5 text-ink-500">({formatNumero(a.enviado)})</span>}
                    </p>
                  ))}
                </td>
                <td className="px-3 py-2.5 text-right align-top text-ink-100">{formatNumero(enviado)}</td>
                <td className="px-3 py-2.5 text-right align-top text-ink-100">{formatNumero(recibido)}</td>
                <td className="py-2.5 pr-5 pl-3 text-right align-top">
                  {cancelado ? (
                    <span className="text-ink-500">—</span>
                  ) : !cerrado ? (
                    <span className="text-xs text-ink-400">{enviado - recibido > 0 ? `${formatNumero(enviado - recibido)} por recibir` : "—"}</span>
                  ) : dif === 0 ? (
                    <span className="text-success">✓ 0</span>
                  ) : (
                    <span className={`font-semibold ${dif < 0 ? "text-danger" : "text-warning"}`} title={dif < 0 ? "Amazon recibió menos de lo enviado" : "Amazon recibió más de lo enviado"}>
                      {dif > 0 ? "+" : "−"}
                      {formatNumero(Math.abs(dif))}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Inbound shipments: the open ones always visible, closed ones collapsed to the latest few. */
export function EnviosFBA({ envios, actualizadoEn }: { envios: EnvioGuardado[]; actualizadoEn: string | null }) {
  const [abierta, setAbierta] = useState(false);
  const enCurso = envios.filter((e) => !FINALES.has(e.estado));
  const cerrados = envios.filter((e) => FINALES.has(e.estado) && e.estado !== "DELETED");
  const porRecibir = enCurso.reduce((s, e) => s + Math.max(0, suma(e, "enviado") - suma(e, "recibido")), 0);
  const faltan = cerrados.filter((e) => e.estado === "CLOSED").reduce((s, e) => s + Math.max(0, suma(e, "enviado") - suma(e, "recibido")), 0);
  const conFaltas = cerrados.filter((e) => e.estado === "CLOSED" && suma(e, "recibido") < suma(e, "enviado")).length;
  const visibles = abierta ? cerrados : cerrados.slice(0, FILAS_PLEGADA);

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-ink-900/70">
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-sm font-medium text-ink-300">Envíos a Amazon</h2>
          <p className="text-xs text-ink-400">
            Tus envíos FBA de los últimos 12 meses (Europa y Reino Unido), con las unidades enviadas y las que Amazon ha recibido.
            {!actualizadoEn && " Se traen en la próxima sincronización o con «Actualizar stock»."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-ink-300">
            En curso: <strong className="text-ink-100">{enCurso.length}</strong>
            {porRecibir > 0 && ` · ${formatNumero(porRecibir)} uds por recibir`}
          </span>
          <span className={`rounded-lg border px-2.5 py-1.5 ${faltan > 0 ? "border-danger/40 text-danger" : "border-white/[0.08] text-ink-300"}`}>
            Faltan en envíos cerrados: <strong>{formatNumero(faltan)}</strong>
            {conFaltas > 0 && ` uds en ${conFaltas} ${conFaltas === 1 ? "envío" : "envíos"}`}
          </span>
        </div>
      </div>

      <h3 className="px-5 pt-4 text-xs font-medium text-ink-300">En curso</h3>
      {enCurso.length === 0 ? <p className="px-5 py-3 text-sm text-ink-400">No hay envíos en camino ahora mismo.</p> : <Tabla envios={enCurso} />}

      {cerrados.length > 0 && (
        <>
          <h3 className="border-t border-white/[0.06] px-5 pt-4 text-xs font-medium text-ink-300">Cerrados y cancelados</h3>
          <Tabla envios={visibles} />
          {cerrados.length > FILAS_PLEGADA && (
            <button
              onClick={() => setAbierta((v) => !v)}
              aria-expanded={abierta}
              className="flex w-full items-center justify-center gap-1.5 border-t border-white/[0.06] py-2.5 text-xs text-ink-400 hover:bg-white/[0.03] hover:text-ink-100"
            >
              {abierta ? "Ver menos" : `Ver todos (${cerrados.length})`}
              <svg viewBox="0 0 16 16" className={`size-3.5 transition-transform ${abierta ? "rotate-180" : ""}`} aria-hidden>
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </>
      )}
    </section>
  );
}
