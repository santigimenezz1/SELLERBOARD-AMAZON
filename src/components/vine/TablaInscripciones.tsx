"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EstadoVine, InscripcionVine } from "@/lib/datos/vine";
import { formatNumero } from "@/lib/format";
import { Spinner } from "@/components/Spinner";

const ESTADOS: EstadoVine[] = ["Activo", "Finalizado", "Pausado", "Interrumpido"];
const COLOR_ESTADO: Record<EstadoVine, string> = {
  Activo: "bg-success/10 text-success",
  Finalizado: "bg-white/[0.06] text-ink-300",
  Pausado: "bg-warning/10 text-warning",
  Interrumpido: "bg-danger/10 text-danger",
};
const fecha = (f: string | null) => (f ? new Date(`${f}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" }) : "—");
const campo = "h-8 w-full rounded-md border border-white/[0.12] bg-ink-950/60 px-2 text-xs text-ink-100 outline-none focus:border-accent-500/60";
const vacia = (): InscripcionVine => ({ id: "", asin: "", nombre: "", estado: "Activo", fechaInscripcion: null, fechaLanzamiento: null, disponible: 0, registrado: 0, reclamado: 0, resenas: 0 });

/** Vine enrollments of one marketplace, laid out like Seller Central's Vine page, editable by hand. */
export function TablaInscripciones({ marketplaceId, pais, filas, imagenes, dominio }: { marketplaceId: string; pais: string; filas: InscripcionVine[]; imagenes: Record<string, string>; dominio: string }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<InscripcionVine[]>(filas);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cambiar = (i: number, cambio: Partial<InscripcionVine>) => setBorrador(borrador.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/vine", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marketplaceId, filas: borrador }) });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(b.error ?? `Error ${r.status}`);
      setEditando(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const total = (k: "registrado" | "reclamado" | "resenas") => filas.reduce((s, f) => s + f[k], 0);

  return (
    <article className="min-w-0 overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-white" style={{ background: "#2c90b6" }}>
        <h2 className="text-[15px] leading-tight font-semibold">Inscripciones en Vine · {pais}</h2>
        {!editando ? (
          <button
            onClick={() => {
              setBorrador(filas);
              setEditando(true);
            }}
            className="rounded-md border border-white/30 bg-white/15 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/25"
          >
            Editar
          </button>
        ) : (
          <span className="flex gap-2">
            <button onClick={() => setEditando(false)} disabled={guardando} className="rounded-md px-2.5 py-1 text-xs text-white/80 hover:text-white">
              Cancelar
            </button>
            <button onClick={guardar} disabled={guardando} className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-ink-950 hover:bg-white/90">
              {guardando && <Spinner tamano="sm" />}
              Guardar
            </button>
          </span>
        )}
      </header>

      <div className="overflow-x-auto">
        <table className="tabular w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-left text-xs text-ink-400">
              <th className="py-2.5 pr-3 pl-4 font-medium">
                Nombre del producto
                <span className="block font-normal text-ink-500">ASIN</span>
              </th>
              <th className="px-3 py-2.5 font-medium">Estado</th>
              <th className="px-3 py-2.5 font-medium">
                Fecha de inscripción
                <span className="block font-normal text-ink-500">Lanzamiento de la página</span>
              </th>
              <th className="px-3 py-2.5 text-right font-medium">Disponible</th>
              <th className="px-3 py-2.5 text-right font-medium">
                Registrado
                <span className="block font-normal text-ink-500">Reclamado</span>
              </th>
              <th className="py-2.5 pr-4 pl-3 text-right font-medium">Reseñas de Amazon Vine</th>
              {editando && <th className="w-10" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {!editando &&
              filas.map((f) => (
                <tr key={f.id}>
                  <td className="py-3 pr-3 pl-4">
                    <span className="flex items-center gap-3">
                      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-0.5">
                        {imagenes[f.asin] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imagenes[f.asin]} alt="" className="size-full object-contain" />
                        ) : (
                          <span className="text-[9px] text-ink-600">Sin foto</span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <a href={`https://${dominio}/dp/${f.asin}`} target="_blank" rel="noopener" className="line-clamp-2 max-w-xs text-[13px] leading-snug text-accent-300 hover:underline">
                          {f.nombre}
                        </a>
                        <span className="block font-mono text-[11px] text-ink-500">{f.asin}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${COLOR_ESTADO[f.estado]}`}>{f.estado}</span>
                  </td>
                  <td className="px-3 py-3 text-ink-100">
                    {fecha(f.fechaInscripcion)}
                    <span className="block text-xs text-ink-500">{fecha(f.fechaLanzamiento)}</span>
                  </td>
                  <td className="px-3 py-3 text-right text-ink-100">{formatNumero(f.disponible)}</td>
                  <td className="px-3 py-3 text-right text-ink-100">
                    {formatNumero(f.registrado)}
                    <span className="block text-xs text-ink-500">{formatNumero(f.reclamado)}</span>
                  </td>
                  <td className="py-3 pr-4 pl-3 text-right text-base font-semibold text-ink-100">{formatNumero(f.resenas)}</td>
                </tr>
              ))}

            {editando &&
              borrador.map((f, i) => (
                <tr key={f.id || `nueva-${i}`} className="align-top">
                  <td className="py-2 pr-3 pl-4">
                    <input className={campo} value={f.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} placeholder="Nombre del producto" maxLength={200} />
                    <input className={`${campo} mt-1 font-mono uppercase`} value={f.asin} onChange={(e) => cambiar(i, { asin: e.target.value.toUpperCase() })} placeholder="ASIN" maxLength={10} />
                  </td>
                  <td className="px-3 py-2">
                    <select className={`${campo} min-w-[118px]`} value={f.estado} onChange={(e) => cambiar(i, { estado: e.target.value as EstadoVine })}>
                      {ESTADOS.map((e) => (
                        <option key={e}>{e}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input type="date" className={campo} value={f.fechaInscripcion ?? ""} onChange={(e) => cambiar(i, { fechaInscripcion: e.target.value || null })} aria-label="Fecha de inscripción" />
                    <input type="date" className={`${campo} mt-1`} value={f.fechaLanzamiento ?? ""} onChange={(e) => cambiar(i, { fechaLanzamiento: e.target.value || null })} aria-label="Fecha de lanzamiento" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min={0} className={`${campo} text-right`} value={f.disponible} onChange={(e) => cambiar(i, { disponible: Number(e.target.value) })} aria-label="Disponible" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min={0} className={`${campo} text-right`} value={f.registrado} onChange={(e) => cambiar(i, { registrado: Number(e.target.value) })} aria-label="Registrado" />
                    <input type="number" min={0} className={`${campo} mt-1 text-right`} value={f.reclamado} onChange={(e) => cambiar(i, { reclamado: Number(e.target.value) })} aria-label="Reclamado" />
                  </td>
                  <td className="py-2 pr-1 pl-3">
                    <input type="number" min={0} className={`${campo} text-right`} value={f.resenas} onChange={(e) => cambiar(i, { resenas: Number(e.target.value) })} aria-label="Reseñas" />
                  </td>
                  <td className="py-2 pr-3">
                    <button onClick={() => setBorrador(borrador.filter((_, j) => j !== i))} title="Quitar" className="rounded-md px-2 py-1 text-xs text-ink-400 hover:bg-danger/10 hover:text-danger">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {!editando && filas.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-400">Sin productos inscritos en Vine en {pais}. Pulsa «Editar» para añadirlos.</p>}
      {editando && (
        <button onClick={() => setBorrador([...borrador, vacia()])} className="block w-full border-t border-white/[0.06] px-4 py-2.5 text-left text-sm text-accent-400 hover:text-accent-300">
          ＋ Añadir producto
        </button>
      )}
      {error && <p className="border-t border-danger/20 bg-danger/10 px-4 py-2 text-xs text-danger">{error}</p>}
      <p className="border-t border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[11px] leading-snug text-ink-500">
        {filas.length > 0 && `${formatNumero(total("registrado"))} registradas · ${formatNumero(total("reclamado"))} reclamadas · ${formatNumero(total("resenas"))} reseñas. `}
        Amazon no da estos datos por API: cópialos de Seller Central → Publicidad → Vine y pulsa «Editar».
      </p>
    </article>
  );
}
