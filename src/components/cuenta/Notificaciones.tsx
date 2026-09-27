"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EstadoNotificaciones, Notificacion } from "@/lib/datos/notificaciones";
import { formatFechaHora } from "@/lib/format";
import { Spinner } from "@/components/Spinner";

const FILAS_PAGINA = 25;

/** «Notificaciones de performance» of one marketplace (plus account-wide ones), from the seller's Gmail. */
export function Notificaciones({ datos, marketplaceId, pais }: { datos: EstadoNotificaciones; marketplaceId: string; pais: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<{ tipo: "idle" | "cargando" } | { tipo: "error"; msg: string }>({ tipo: "idle" });
  const [pagina, setPagina] = useState(1);

  async function llamar(url: string, cuerpo?: object) {
    setEstado({ tipo: "cargando" });
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo ?? {}) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
      setEstado({ tipo: "idle" });
      router.refresh();
    } catch (e) {
      setEstado({ tipo: "error", msg: e instanceof Error ? e.message : "Error" });
    }
  }

  if (!datos.configurado || !datos.conectado) {
    return (
      <div className="max-w-2xl rounded-xl border border-white/[0.06] bg-ink-900/80 p-5">
        <h2 className="text-base font-semibold text-ink-100">Conecta tu Gmail</h2>
        <p className="mt-1 text-sm text-ink-400">
          Amazon no ofrece las notificaciones de performance por API, pero te envía cada una por correo. Con permiso de solo lectura, la app lee
          únicamente los correos de Amazon y los ordena por país.
        </p>
        {datos.configurado ? (
          <a href="/api/gmail/conectar" className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-accent-500 px-3.5 text-sm font-medium text-ink-950 hover:bg-accent-400">
            Conectar Gmail
          </a>
        ) : (
          <p className="mt-4 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning">
            Falta configurar el acceso de Google (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env.local).
          </p>
        )}
      </div>
    );
  }

  const lista = datos.notificaciones.filter((n) => n.mercados.includes(marketplaceId));
  const visibles = lista.slice(0, pagina * FILAS_PAGINA);
  const sinLeer = lista.filter((n) => !n.leida).length;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink-100">Notificaciones de performance</h2>
          <p className="max-w-3xl text-xs text-ink-400">
            Las notificaciones que Amazon te ha enviado sobre tu rendimiento en {pais} en los últimos 2 años, leídas de {datos.email ?? "tu Gmail"}
            {datos.actualizadoEn ? `; actualizado ${formatFechaHora(new Date(datos.actualizadoEn))}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {estado.tipo === "error" && <span className="text-xs text-danger">{estado.msg}</span>}
          {sinLeer > 0 && (
            <button onClick={() => llamar("/api/gmail/leidas", { ids: lista.filter((n) => !n.leida).map((n) => n.id) })} className="h-8 rounded-lg border border-white/[0.1] px-3 text-xs text-ink-300 hover:text-ink-100">
              Marcar todas como leídas
            </button>
          )}
          <button
            onClick={() => llamar("/api/gmail/sincronizar")}
            disabled={estado.tipo === "cargando"}
            className="inline-flex h-8 items-center gap-2 rounded-lg bg-accent-500 px-3 text-xs font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-60"
          >
            {estado.tipo === "cargando" ? <Spinner tamano="sm" /> : <span aria-hidden>↻</span>}
            Actualizar
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
        <p className="border-b border-white/[0.06] px-5 py-2.5 text-xs text-ink-400">
          Notificaciones: {lista.length}
          {sinLeer > 0 && <strong className="ml-2 text-danger">{sinLeer} sin leer</strong>}
        </p>
        {lista.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-400">No hay notificaciones de performance para este país.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-xs text-ink-400">
                <th className="py-2.5 pr-3 pl-5 font-medium">Asunto</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Fecha</th>
                <th className="py-2.5 pr-5 pl-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {visibles.map((n) => (
                <Fila key={n.id} n={n} onLeida={() => llamar("/api/gmail/leidas", { ids: [n.id] })} />
              ))}
            </tbody>
          </table>
        )}
        {visibles.length < lista.length && (
          <button onClick={() => setPagina((p) => p + 1)} className="w-full border-t border-white/[0.06] py-2.5 text-xs text-ink-400 hover:bg-white/[0.03] hover:text-ink-100">
            Ver más ({lista.length - visibles.length})
          </button>
        )}
      </div>
    </section>
  );
}

function Fila({ n, onLeida }: { n: Notificacion & { mercados: string[] }; onLeida: () => void }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <tr className={n.leida ? "" : "bg-accent-500/[0.04]"}>
      <td className="py-2.5 pr-3 pl-5 align-top">
        <button onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} className={`text-left underline-offset-4 hover:underline ${n.leida ? "text-accent-300/80" : "font-semibold text-accent-300"}`}>
          {!n.leida && <span aria-label="Sin leer" className="mr-2 inline-block size-2 rounded-full bg-danger align-middle" />}
          {n.asunto}
        </button>
        {abierta && (
          <div className="mt-2 text-xs leading-relaxed text-ink-300">
            <p className="whitespace-pre-line">{n.extracto}</p>
            <a href={`https://mail.google.com/mail/u/0/#all/${n.id}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-accent-300 hover:underline">
              Abrir el correo completo en Gmail ↗
            </a>
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 align-top whitespace-nowrap text-ink-300">
        {new Date(n.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" })}
      </td>
      <td className="py-2.5 pr-5 pl-3 text-right align-top whitespace-nowrap">
        {!n.leida && (
          <button onClick={onLeida} className="text-xs text-ink-400 underline-offset-4 hover:text-ink-100 hover:underline">
            Marcar como leído
          </button>
        )}
      </td>
    </tr>
  );
}
