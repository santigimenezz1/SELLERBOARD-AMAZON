"use client";

import { useEffect, useRef, useState } from "react";
import type { EnvioWallapop, TipoEnvio } from "@/lib/datos/wallapop";
import { Spinner } from "@/components/Spinner";

const MAXIMO = 15 * 1024 * 1024;

const TIPOS: { id: TipoEnvio; nombre: string; color: string; texto: string }[] = [
  { id: "vinted", nombre: "Vinted", color: "#09b1ba", texto: "#04363a" },
  { id: "wallapop", nombre: "Wallapop", color: "#13c1ac", texto: "#043a33" },
  { id: "correos", nombre: "Correos", color: "#ffcd00", texto: "#3d3100" },
];
const tipoDe = (id: TipoEnvio) => TIPOS.find((t) => t.id === id)!;

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const esPdf = (e: EnvioWallapop) => e.contentType === "application/pdf";
const src = (e: EnvioWallapop) => `/api/wallapop/${e.id}`;

function Etiqueta({ tipo }: { tipo: TipoEnvio }) {
  const t = tipoDe(tipo);
  return (
    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: t.color, color: t.texto }}>
      {t.nombre}
    </span>
  );
}

/** «Wallapop»: upload the images of Vinted, Wallapop and Correos shipments; each one is a card, pending until delivered. */
export function VistaWallapop({ envios, soloLectura }: { envios: EnvioWallapop[]; soloLectura: boolean }) {
  const [lista, setLista] = useState(envios);
  const [vista, setVista] = useState<"pendientes" | "entregadas">("pendientes");
  const [filtro, setFiltro] = useState<TipoEnvio | "todos">("todos");
  const [subiendo, setSubiendo] = useState<{ hecho: number; total: number } | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [abierto, setAbierto] = useState<EnvioWallapop | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const entradas = useRef<Partial<Record<TipoEnvio, HTMLInputElement | null>>>({});

  const pendientes = lista.filter((e) => !e.entregadoEn);
  const entregadas = lista.filter((e) => e.entregadoEn).sort((a, b) => b.entregadoEn!.localeCompare(a.entregadoEn!));
  const base = vista === "pendientes" ? pendientes : entregadas;
  const visibles = base.filter((e) => filtro === "todos" || e.tipo === filtro);
  const cuenta = (tipo: TipoEnvio) => base.filter((e) => e.tipo === tipo).length;

  const subir = async (tipo: TipoEnvio, archivos: File[]) => {
    if (!archivos.length || subiendo) return;
    setErrores([]);
    setSubiendo({ hecho: 0, total: archivos.length });
    const fallos: string[] = [];
    const nuevos: EnvioWallapop[] = [];
    for (const [i, a] of archivos.entries()) {
      try {
        if (a.size > MAXIMO) throw new Error("pasa de 15 MB");
        const f = new FormData();
        f.set("archivo", a);
        f.set("tipo", tipo);
        const r = await fetch("/api/wallapop", { method: "POST", body: f });
        const b = (await r.json().catch(() => ({}))) as { error?: string; envio?: EnvioWallapop };
        if (!r.ok || !b.envio) throw new Error(b.error ?? `error ${r.status}`);
        nuevos.push(b.envio);
      } catch (e) {
        fallos.push(`${a.name}: ${e instanceof Error ? e.message : "no se pudo subir"}`);
      }
      setSubiendo({ hecho: i + 1, total: archivos.length });
    }
    setLista((l) => [...nuevos.reverse(), ...l]);
    setErrores(fallos);
    setSubiendo(null);
    setVista("pendientes");
  };

  const cambiar = async (e: EnvioWallapop, entregado: boolean) => {
    setOcupado(e.id);
    const antes = lista;
    const nuevo = { ...e, entregadoEn: entregado ? new Date().toISOString() : null };
    setLista((l) => l.map((x) => (x.id === e.id ? nuevo : x)));
    if (abierto?.id === e.id) setAbierto(nuevo);
    try {
      const r = await fetch(`/api/wallapop/${e.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ entregado }) });
      const b = (await r.json().catch(() => ({}))) as { error?: string; envio?: EnvioWallapop };
      if (!r.ok || !b.envio) throw new Error(b.error ?? `error ${r.status}`);
      setLista((l) => l.map((x) => (x.id === e.id ? b.envio! : x)));
    } catch (err) {
      setLista(antes);
      setErrores([`No se pudo guardar: ${err instanceof Error ? err.message : "error"}`]);
    } finally {
      setOcupado(null);
    }
  };

  const borrar = async (e: EnvioWallapop) => {
    if (!confirm(`¿Borrar «${e.nombre}»? Se elimina la imagen y no se puede deshacer.`)) return;
    setOcupado(e.id);
    try {
      const r = await fetch(`/api/wallapop/${e.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `error ${r.status}`);
      setLista((l) => l.filter((x) => x.id !== e.id));
      if (abierto?.id === e.id) setAbierto(null);
    } catch (err) {
      setErrores([`No se pudo borrar: ${err instanceof Error ? err.message : "error"}`]);
    } finally {
      setOcupado(null);
    }
  };

  // Esc closes the image.
  useEffect(() => {
    if (!abierto) return;
    const tecla = (ev: KeyboardEvent) => ev.key === "Escape" && setAbierto(null);
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto]);

  return (
    <div className="flex flex-col gap-5">
      {!soloLectura && (
        <div className="grid gap-3 sm:grid-cols-3">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={!!subiendo}
              onClick={() => entradas.current[t.id]?.click()}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-4 text-sm font-medium transition-colors hover:bg-white/[0.04] disabled:opacity-50"
              style={{ borderColor: `${t.color}80`, color: t.color }}
            >
              <span className="text-lg leading-none">＋</span> Subir {t.nombre}
              <input
                ref={(el) => {
                  entradas.current[t.id] = el;
                }}
                type="file"
                accept="image/*,application/pdf"
                multiple
                hidden
                onChange={(ev) => {
                  const archivos = [...(ev.target.files ?? [])];
                  ev.target.value = "";
                  void subir(t.id, archivos);
                }}
              />
            </button>
          ))}
        </div>
      )}

      {subiendo && (
        <div className="flex items-center gap-2 text-sm text-ink-300">
          <Spinner tamano="sm" /> Subiendo {subiendo.hecho} de {subiendo.total}…
        </div>
      )}
      {errores.length > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errores.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-white/[0.08] p-0.5">
          {(
            [
              ["pendientes", `Pendientes (${pendientes.length})`],
              ["entregadas", `Entregadas (${entregadas.length})`],
            ] as const
          ).map(([id, texto]) => (
            <button
              key={id}
              type="button"
              onClick={() => setVista(id)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${vista === id ? "bg-white/[0.08] text-ink-100" : "text-ink-400 hover:text-ink-100"}`}
            >
              {texto}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFiltro("todos")}
            className={`rounded-full border px-3 py-1 text-xs ${filtro === "todos" ? "border-white/30 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
          >
            Todos ({base.length})
          </button>
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFiltro(t.id)}
              className={`rounded-full border px-3 py-1 text-xs ${filtro === t.id ? "text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
              style={filtro === t.id ? { borderColor: t.color } : undefined}
            >
              {t.nombre} ({cuenta(t.id)})
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-white/[0.06] px-4 py-10 text-center text-sm text-ink-400">
          {vista === "pendientes" ? "No hay envíos pendientes." : "Todavía no has entregado ningún envío."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibles.map((e) => (
            <div key={e.id} className={`flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] ${ocupado === e.id ? "opacity-60" : ""}`}>
              <button type="button" onClick={() => setAbierto(e)} className="relative block aspect-[3/4] w-full overflow-hidden bg-ink-950/60" title="Ver">
                {esPdf(e) ? (
                  <span className="flex h-full items-center justify-center text-sm text-ink-400">📄 PDF</span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- private image behind a signed-link redirect
                  <img src={src(e)} alt={e.nombre} loading="lazy" className="h-full w-full object-cover transition-transform hover:scale-[1.03]" />
                )}
                <span className="absolute top-2 left-2">
                  <Etiqueta tipo={e.tipo} />
                </span>
              </button>
              <div className="flex flex-1 flex-col gap-2 p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink-100" title={e.nombre}>
                    {e.nombre}
                  </p>
                  <p className="text-xs text-ink-500">{e.entregadoEn ? `Entregado ${fechaHora(e.entregadoEn)}` : `Subido ${fechaHora(e.subidoEn)}`}</p>
                </div>
                {!soloLectura && (
                  <div className="mt-auto flex gap-1.5">
                    {e.entregadoEn ? (
                      <button type="button" disabled={ocupado === e.id} onClick={() => cambiar(e, false)} className="flex-1 rounded-lg border border-white/[0.1] px-2 py-1.5 text-xs text-ink-300 hover:bg-white/[0.05]">
                        ↩ A pendiente
                      </button>
                    ) : (
                      <button type="button" disabled={ocupado === e.id} onClick={() => cambiar(e, true)} className="flex-1 rounded-lg bg-success/90 px-2 py-1.5 text-xs font-semibold text-ink-950 hover:bg-success">
                        ✓ Entregado
                      </button>
                    )}
                    <button type="button" disabled={ocupado === e.id} onClick={() => borrar(e)} title="Borrar" className="rounded-lg border border-white/[0.1] px-2 py-1.5 text-xs text-ink-400 hover:border-danger/50 hover:text-danger">
                      🗑
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {abierto && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/85 p-3 sm:p-6" onClick={() => setAbierto(null)}>
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 pb-3" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex min-w-0 items-center gap-2">
              <Etiqueta tipo={abierto.tipo} />
              <span className="truncate text-sm text-ink-100">{abierto.nombre}</span>
            </div>
            <div className="flex shrink-0 gap-2">
              {!soloLectura &&
                (abierto.entregadoEn ? (
                  <button type="button" onClick={() => cambiar(abierto, false)} className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-ink-200 hover:bg-white/10">
                    ↩ A pendiente
                  </button>
                ) : (
                  <button type="button" onClick={() => cambiar(abierto, true)} className="rounded-lg bg-success px-3 py-1.5 text-sm font-semibold text-ink-950">
                    ✓ Entregado
                  </button>
                ))}
              <a href={src(abierto)} target="_blank" rel="noreferrer" className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-ink-200 hover:bg-white/10">
                Abrir
              </a>
              <button type="button" onClick={() => setAbierto(null)} className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-ink-200 hover:bg-white/10" aria-label="Cerrar">
                ✕
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {esPdf(abierto) ? (
              <iframe src={src(abierto)} title={abierto.nombre} className="h-full w-full max-w-4xl rounded-lg bg-white" onClick={(ev) => ev.stopPropagation()} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- private image behind a signed-link redirect
              <img src={src(abierto)} alt={abierto.nombre} className="max-h-full max-w-full rounded-lg object-contain" onClick={(ev) => ev.stopPropagation()} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
