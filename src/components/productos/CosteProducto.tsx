"use client";

import { useState } from "react";
import type { Escandallo, Pieza, Proveedor } from "@/lib/datos/escandallos";
import { formatEuros, formatFechaHora } from "@/lib/format";
import { Spinner } from "@/components/Spinner";

const nuevoId = () => Math.random().toString(36).slice(2, 10);
const redondear = (v: number) => Math.round(v * 100) / 100;
const subtotal = (p: Proveedor) => redondear(p.piezas.reduce((s, x) => s + (Number.isFinite(x.coste) ? x.coste : 0), 0));
/** "4,20" or "4.20" → 4.2 (NaN if not a number). */
const aNumero = (t: string) => (t.trim() === "" ? NaN : Number(t.replace(",", ".")));
const aTexto = (n: number) => (Number.isFinite(n) ? (Number(n.toFixed(2)) === n ? n.toFixed(2) : String(n)).replace(".", ",") : "");

type Estado = { tipo: "idle" | "guardando" } | { tipo: "ok" } | { tipo: "error"; msg: string };

/** Editable cost breakdown of one product: pieces grouped by supplier, subtotals and the total unit cost. */
export function CosteProducto({ inicial }: { inicial: Escandallo }) {
  const [proveedores, setProveedores] = useState<Proveedor[]>(inicial.proveedores);
  // Raw text of each price field while typing (so "4," isn't turned into 4 mid-edit).
  const [textos, setTextos] = useState<Record<string, string>>(() =>
    Object.fromEntries(inicial.proveedores.flatMap((p) => p.piezas.map((x) => [x.id, aTexto(x.coste)]))),
  );
  const [guardado, setGuardado] = useState(JSON.stringify(inicial.proveedores));
  const [actualizadoEn, setActualizadoEn] = useState(inicial.actualizadoEn);
  const [estado, setEstado] = useState<Estado>({ tipo: "idle" });

  const cambiado = JSON.stringify(proveedores) !== guardado;
  const invalido = proveedores.some((p) => p.piezas.some((x) => !Number.isFinite(x.coste) || x.coste < 0));
  const total = redondear(proveedores.reduce((s, p) => s + subtotal(p), 0));

  const editarProveedor = (id: string, cambio: Partial<Proveedor>) => setProveedores((ps) => ps.map((p) => (p.id === id ? { ...p, ...cambio } : p)));
  const editarPieza = (idP: string, idX: string, cambio: Partial<Pieza>) =>
    setProveedores((ps) => ps.map((p) => (p.id === idP ? { ...p, piezas: p.piezas.map((x) => (x.id === idX ? { ...x, ...cambio } : x)) } : p)));

  function añadirPieza(idP: string) {
    const id = nuevoId();
    setTextos((t) => ({ ...t, [id]: "" }));
    setProveedores((ps) => ps.map((p) => (p.id === idP ? { ...p, piezas: [...p.piezas, { id, nombre: "", coste: NaN }] } : p)));
  }
  function añadirProveedor() {
    const id = nuevoId();
    const idPieza = nuevoId();
    setTextos((t) => ({ ...t, [idPieza]: "" }));
    setProveedores((ps) => [...ps, { id, nombre: "", piezas: [{ id: idPieza, nombre: "", coste: NaN }] }]);
  }

  async function guardar() {
    setEstado({ tipo: "guardando" });
    try {
      const res = await fetch(`/api/productos/${inicial.asin}/costes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proveedores }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; actualizadoEn?: string };
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
      setGuardado(JSON.stringify(proveedores));
      setActualizadoEn(body.actualizadoEn ?? new Date().toISOString());
      setEstado({ tipo: "ok" });
    } catch (e) {
      setEstado({ tipo: "error", msg: e instanceof Error ? e.message : "Error" });
    }
  }

  const campo =
    "h-8 rounded-md border border-white/[0.08] bg-ink-950/60 px-2 text-sm text-ink-100 outline-none placeholder:text-ink-600 hover:border-white/[0.14] focus:border-accent-500/70";

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-ink-900/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink-100">Coste del producto</h2>
          <p className="mt-0.5 text-xs text-ink-400">
            Lo que te cuesta una unidad, pieza a pieza (sin IVA).{" "}
            {actualizadoEn ? `Guardado: ${formatFechaHora(new Date(actualizadoEn))}` : <span className="text-warning">Precios de ejemplo: cámbialos por los reales y guarda.</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-400">Coste total por unidad</p>
          <p className="tabular text-3xl font-semibold tracking-tight text-ink-100">{formatEuros(total)}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {proveedores.length === 0 && <p className="text-sm text-ink-400">Aún no hay piezas. Añade un proveedor para empezar.</p>}
        {proveedores.map((p) => (
          <div key={p.id} className="rounded-xl border border-white/[0.06] bg-ink-950/30">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
              <label className="sr-only" htmlFor={`prov-${p.id}`}>
                Proveedor
              </label>
              <input
                id={`prov-${p.id}`}
                value={p.nombre}
                onChange={(e) => editarProveedor(p.id, { nombre: e.target.value })}
                placeholder="Nombre del proveedor"
                className={`${campo} flex-1 font-medium`}
              />
              <span className="tabular w-24 text-right text-sm font-semibold text-ink-100">{formatEuros(subtotal(p))}</span>
              <button
                onClick={() => setProveedores((ps) => ps.filter((x) => x.id !== p.id))}
                aria-label={`Quitar proveedor ${p.nombre}`}
                className="inline-flex size-8 items-center justify-center rounded-md text-ink-400 hover:bg-danger/10 hover:text-danger"
              >
                ×
              </button>
            </div>
            <ul className="divide-y divide-white/[0.04]">
              {p.piezas.map((x) => (
                <li key={x.id} className="flex items-center gap-2 px-3 py-1.5 pl-6">
                  <input
                    value={x.nombre}
                    onChange={(e) => editarPieza(p.id, x.id, { nombre: e.target.value })}
                    placeholder="Pieza (p. ej. calcetines)"
                    aria-label="Pieza"
                    className={`${campo} flex-1`}
                  />
                  <div className="relative">
                    <input
                      value={textos[x.id] ?? aTexto(x.coste)}
                      onChange={(e) => {
                        setTextos((t) => ({ ...t, [x.id]: e.target.value }));
                        editarPieza(p.id, x.id, { coste: aNumero(e.target.value) });
                      }}
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-label={`Coste de ${x.nombre || "la pieza"}`}
                      aria-invalid={textos[x.id] !== "" && !Number.isFinite(x.coste)}
                      className={`${campo} tabular w-24 pr-6 text-right aria-[invalid=true]:border-danger/60`}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-ink-400">€</span>
                  </div>
                  <button
                    onClick={() => editarProveedor(p.id, { piezas: p.piezas.filter((y) => y.id !== x.id) })}
                    aria-label={`Quitar ${x.nombre || "pieza"}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-ink-600 hover:bg-danger/10 hover:text-danger"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={() => añadirPieza(p.id)} className="m-2 ml-6 text-xs text-ink-400 hover:text-ink-100">
              + Añadir pieza
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button onClick={añadirProveedor} className="text-sm text-ink-400 hover:text-ink-100">
          + Añadir proveedor
        </button>
        <div className="flex items-center gap-3">
          <span aria-live="polite" className="text-xs">
            {estado.tipo === "ok" && !cambiado && <span className="text-success">Guardado</span>}
            {estado.tipo === "error" && <span className="text-danger">{estado.msg}</span>}
            {invalido && <span className="text-warning">Revisa los precios vacíos o incorrectos</span>}
          </span>
          <button
            onClick={guardar}
            disabled={!cambiado && actualizadoEn !== null ? true : invalido || estado.tipo === "guardando"}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent-500 px-4 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-40"
          >
            {estado.tipo === "guardando" && <Spinner tamano="sm" />}
            Guardar costes
          </button>
        </div>
      </div>
    </section>
  );
}
