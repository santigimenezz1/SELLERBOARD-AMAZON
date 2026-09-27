"use client";

import { useState } from "react";
import type { ContactoProveedor } from "@/lib/datos/proveedores";
import { formatFechaHora } from "@/lib/format";
import { Spinner } from "@/components/Spinner";
import { CABECERAS_PROVEEDOR, COLOR_INSPECCION } from "./colores";

type Campo = "empresa" | "telefono" | "email" | "alibaba";
const CAMPOS: { clave: Campo; etiqueta: string; placeholder: string; tipo: string }[] = [
  { clave: "empresa", etiqueta: "Empresa", placeholder: "Nombre de la empresa", tipo: "text" },
  { clave: "telefono", etiqueta: "Teléfono", placeholder: "+86 …", tipo: "tel" },
  { clave: "email", etiqueta: "Correo electrónico", placeholder: "ventas@empresa.com", tipo: "email" },
  { clave: "alibaba", etiqueta: "Tienda en Alibaba", placeholder: "https://empresa.en.alibaba.com", tipo: "url" },
];

/** One collapsible contact card per supplier in the product's cost breakdown. */
export function ProveedoresProducto({ contactos }: { contactos: ContactoProveedor[] }) {
  if (contactos.length === 0) return null;
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-semibold tracking-tight text-ink-100">Proveedores del producto</h2>
        <p className="text-xs text-ink-400">Datos de contacto de cada proveedor del coste y de la empresa de inspección. Un mismo proveedor se comparte entre productos.</p>
      </div>
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
        {contactos.map((c, i) => (
          <TarjetaProveedor key={c.id} inicial={c} color={c.id === "empresa-de-inspeccion" ? COLOR_INSPECCION : CABECERAS_PROVEEDOR[i % CABECERAS_PROVEEDOR.length]} />
        ))}
      </div>
    </section>
  );
}

function TarjetaProveedor({ inicial, color }: { inicial: ContactoProveedor; color: string }) {
  const [c, setC] = useState(inicial);
  const [borrador, setBorrador] = useState(inicial);
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [estado, setEstado] = useState<{ tipo: "idle" | "guardando" } | { tipo: "error"; msg: string }>({ tipo: "idle" });

  async function guardar() {
    setEstado({ tipo: "guardando" });
    try {
      const res = await fetch("/api/proveedores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: c.nombre, empresa: borrador.empresa, telefono: borrador.telefono, email: borrador.email, alibaba: borrador.alibaba }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; contacto?: ContactoProveedor };
      if (!res.ok || !body.contacto) throw new Error(body.error ?? `Error ${res.status}`);
      setC(body.contacto);
      setEditando(false);
      setEstado({ tipo: "idle" });
    } catch (e) {
      setEstado({ tipo: "error", msg: e instanceof Error ? e.message : "Error" });
    }
  }

  const idPanel = `contacto-${c.id}`;
  const vacio = !c.empresa && !c.telefono && !c.email && !c.alibaba;

  return (
    <article className="overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
      <header className="px-4 py-2.5 text-white" style={{ background: color }}>
        <p className="text-[15px] leading-tight font-semibold">{c.nombre}</p>
      </header>

      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={idPanel}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03]"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink-100">{c.empresa || "Sin datos de contacto"}</span>
          {c.actualizadoEn === null && !vacio && <span className="text-[11px] text-warning">Datos de ejemplo</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-ink-400">
          {abierto ? "Ocultar" : "Ver contacto"}
          <svg viewBox="0 0 16 16" className={`size-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden>
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {abierto && (
        <div id={idPanel} className="border-t border-white/[0.06] px-4 pt-3 pb-4">
          {editando ? (
            <form
              className="space-y-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                guardar();
              }}
            >
              {CAMPOS.map((f) => (
                <label key={f.clave} className="block">
                  <span className="text-[11px] text-ink-400">{f.etiqueta}</span>
                  <input
                    type={f.tipo}
                    value={borrador[f.clave]}
                    onChange={(e) => setBorrador((b) => ({ ...b, [f.clave]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="mt-0.5 h-8 w-full rounded-md border border-white/[0.08] bg-ink-950/60 px-2 text-sm text-ink-100 outline-none placeholder:text-ink-600 hover:border-white/[0.14] focus:border-accent-500/70"
                  />
                </label>
              ))}
              {estado.tipo === "error" && <p className="text-xs text-danger">{estado.msg}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditando(false)} className="h-8 rounded-lg border border-white/[0.1] px-3 text-sm text-ink-300 hover:text-ink-100">
                  Cancelar
                </button>
                <button type="submit" disabled={estado.tipo === "guardando"} className="inline-flex h-8 items-center gap-2 rounded-lg bg-accent-500 px-3 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-50">
                  {estado.tipo === "guardando" && <Spinner tamano="sm" />}
                  Guardar
                </button>
              </div>
            </form>
          ) : (
            <>
              <dl className="space-y-2 text-sm">
                <Dato etiqueta="Empresa">{c.empresa}</Dato>
                <Dato etiqueta="Teléfono">
                  {c.telefono && (
                    <a href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`} className="text-ink-100 hover:text-accent-300 hover:underline">
                      {c.telefono}
                    </a>
                  )}
                </Dato>
                <Dato etiqueta="Correo">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="break-all text-ink-100 hover:text-accent-300 hover:underline">
                      {c.email}
                    </a>
                  )}
                </Dato>
                <Dato etiqueta="Alibaba">
                  {c.alibaba && (
                    <a href={c.alibaba} target="_blank" rel="noopener noreferrer" className="break-all text-ink-100 hover:text-accent-300 hover:underline">
                      {c.alibaba.replace(/^https?:\/\//, "")} ↗
                    </a>
                  )}
                </Dato>
              </dl>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[11px] text-ink-600">{c.actualizadoEn ? `Guardado: ${formatFechaHora(new Date(c.actualizadoEn))}` : ""}</span>
                <button
                  onClick={() => {
                    setBorrador(c);
                    setEstado({ tipo: "idle" });
                    setEditando(true);
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 text-xs text-ink-300 hover:border-white/[0.2] hover:text-ink-100"
                >
                  ✎ Editar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-2">
      <dt className="text-ink-400">{etiqueta}</dt>
      <dd className="min-w-0">{children || <span className="text-ink-600">—</span>}</dd>
    </div>
  );
}
