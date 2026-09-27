"use client";

import { useState } from "react";
import type { Escandallo, Pieza, Proveedor } from "@/lib/datos/escandallos";
import { formatEuros, formatFechaHora } from "@/lib/format";
import { Spinner } from "@/components/Spinner";
import { useRouter } from "next/navigation";
import { CABECERAS_PROVEEDOR as CABECERAS } from "./colores";

const nuevoId = () => Math.random().toString(36).slice(2, 10);
const redondear = (v: number) => Math.round(v * 100) / 100;
const subtotal = (p: Proveedor) => redondear(p.piezas.reduce((s, x) => s + (Number.isFinite(x.coste) ? x.coste : 0), 0));
/** "4,20" or "4.20" → 4.2 (NaN if not a number). */
const aNumero = (t: string) => (t.trim() === "" ? NaN : Number(t.replace(",", ".")));
const aTexto = (n: number) => (Number.isFinite(n) ? (Number(n.toFixed(2)) === n ? n.toFixed(2) : String(n)).replace(".", ",") : "");


type Estado = { tipo: "idle" | "guardando" } | { tipo: "ok" } | { tipo: "error"; msg: string };

type Props = {
  inicial: Escandallo;
  /** Current selling price on amazon.es (VAT included), to show what share of it the cost is. */
  precioVenta: number | null;
};

/** A product's unit cost, dashboard-style: one tile per supplier plus the total. Read-only until "Editar". */
export function CosteProducto({ inicial, precioVenta }: Props) {
  const router = useRouter();
  const [guardados, setGuardados] = useState<Proveedor[]>(inicial.proveedores);
  const [proveedores, setProveedores] = useState<Proveedor[]>(inicial.proveedores);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState(false);
  const [actualizadoEn, setActualizadoEn] = useState(inicial.actualizadoEn);
  const [estado, setEstado] = useState<Estado>({ tipo: "idle" });

  const lista = editando ? proveedores : guardados;
  const total = redondear(lista.reduce((s, p) => s + subtotal(p), 0));
  const invalido = proveedores.some((p) => p.piezas.some((x) => !Number.isFinite(x.coste) || x.coste < 0));
  const cambiado = JSON.stringify(proveedores) !== JSON.stringify(guardados);

  function empezar() {
    setProveedores(guardados);
    setTextos(Object.fromEntries(guardados.flatMap((p) => p.piezas.map((x) => [x.id, aTexto(x.coste)]))));
    setEstado({ tipo: "idle" });
    setEditando(true);
  }

  const editarProveedor = (id: string, cambio: Partial<Proveedor>) => setProveedores((ps) => ps.map((p) => (p.id === id ? { ...p, ...cambio } : p)));
  const editarPieza = (idP: string, idX: string, cambio: Partial<Pieza>) =>
    setProveedores((ps) => ps.map((p) => (p.id === idP ? { ...p, piezas: p.piezas.map((x) => (x.id === idX ? { ...x, ...cambio } : x)) } : p)));
  function añadirPieza(idP: string) {
    const id = nuevoId();
    setTextos((t) => ({ ...t, [id]: "" }));
    setProveedores((ps) => ps.map((p) => (p.id === idP ? { ...p, piezas: [...p.piezas, { id, nombre: "", coste: NaN }] } : p)));
  }
  function añadirProveedor() {
    const idPieza = nuevoId();
    setTextos((t) => ({ ...t, [idPieza]: "" }));
    setProveedores((ps) => [...ps, { id: nuevoId(), nombre: "", piezas: [{ id: idPieza, nombre: "", coste: NaN }] }]);
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
      setGuardados(proveedores);
      setActualizadoEn(body.actualizadoEn ?? new Date().toISOString());
      setEditando(false);
      setEstado({ tipo: "ok" });
      // Suppliers added or renamed here must show up in "Proveedores del producto".
      router.refresh();
    } catch (e) {
      setEstado({ tipo: "error", msg: e instanceof Error ? e.message : "Error" });
    }
  }

  const campo =
    "h-8 w-full rounded-md border border-white/[0.08] bg-ink-950/60 px-2 text-sm text-ink-100 outline-none placeholder:text-ink-600 hover:border-white/[0.14] focus:border-accent-500/70";
  const cuota = precioVenta && total > 0 ? (total / precioVenta) * 100 : null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink-100">Coste del producto</h2>
          <p className="text-xs text-ink-400">
            Lo que te cuesta una unidad (sin IVA).{" "}
            {actualizadoEn ? `Guardado: ${formatFechaHora(new Date(actualizadoEn))}` : <span className="text-warning">Precios de ejemplo: cámbialos por los reales.</span>}
            {estado.tipo === "ok" && <span className="ml-2 text-success">✓ Guardado</span>}
          </p>
        </div>
        {editando ? (
          <div className="flex flex-wrap items-center gap-2">
            {estado.tipo === "error" && <span className="text-xs text-danger">{estado.msg}</span>}
            {invalido && <span className="text-xs text-warning">Revisa los precios vacíos o incorrectos</span>}
            <button onClick={() => setEditando(false)} className="h-9 rounded-lg border border-white/[0.1] px-3 text-sm text-ink-300 hover:text-ink-100">
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={invalido || estado.tipo === "guardando" || (!cambiado && actualizadoEn !== null)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent-500 px-4 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-40"
            >
              {estado.tipo === "guardando" && <Spinner tamano="sm" />}
              Guardar costes
            </button>
          </div>
        ) : (
          <button onClick={empezar} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 text-sm text-ink-300 hover:border-white/[0.2] hover:text-ink-100">
            ✎ Editar costes
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(230px,1fr))]">
        {lista.map((p, i) => (
          <article key={p.id} className="flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
            <header className="flex items-center gap-2 px-4 py-2.5 text-white" style={{ background: CABECERAS[i % CABECERAS.length] }}>
              {editando ? (
                <>
                  <input
                    value={p.nombre}
                    onChange={(e) => editarProveedor(p.id, { nombre: e.target.value })}
                    placeholder="Nombre del proveedor"
                    aria-label="Nombre del proveedor"
                    className="h-7 min-w-0 flex-1 rounded border border-white/30 bg-white/15 px-2 text-sm font-semibold text-white outline-none placeholder:text-white/60 focus:border-white"
                  />
                  <button onClick={() => setProveedores((ps) => ps.filter((x) => x.id !== p.id))} aria-label={`Quitar ${p.nombre || "proveedor"}`} className="rounded px-1.5 text-white/80 hover:bg-white/20 hover:text-white">
                    ×
                  </button>
                </>
              ) : (
                <p className="text-[15px] leading-tight font-semibold">{p.nombre}</p>
              )}
            </header>
            <div className="flex flex-1 flex-col px-4 pt-3 pb-4">
              <p className="text-xs text-ink-400">Coste</p>
              <p className="tabular mt-0.5 text-2xl font-semibold tracking-tight text-ink-100">{formatEuros(subtotal(p))}</p>
              <ul className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">
                {p.piezas.map((x) =>
                  editando ? (
                    <li key={x.id} className="flex items-center gap-1.5">
                      <input value={x.nombre} onChange={(e) => editarPieza(p.id, x.id, { nombre: e.target.value })} placeholder="Concepto" aria-label="Concepto" className={`${campo} min-w-0 flex-1`} />
                      <div className="relative w-20 shrink-0">
                        <input
                          value={textos[x.id] ?? aTexto(x.coste)}
                          onChange={(e) => {
                            setTextos((t) => ({ ...t, [x.id]: e.target.value }));
                            editarPieza(p.id, x.id, { coste: aNumero(e.target.value) });
                          }}
                          inputMode="decimal"
                          placeholder="0,00"
                          aria-label={`Coste de ${x.nombre || "la pieza"}`}
                          aria-invalid={!Number.isFinite(x.coste)}
                          className={`${campo} tabular pr-5 text-right aria-[invalid=true]:border-danger/60`}
                        />
                        <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-xs text-ink-400">€</span>
                      </div>
                      <button onClick={() => editarProveedor(p.id, { piezas: p.piezas.filter((y) => y.id !== x.id) })} aria-label={`Quitar ${x.nombre || "pieza"}`} className="text-ink-600 hover:text-danger">
                        ×
                      </button>
                    </li>
                  ) : (
                    <li key={x.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-ink-300">{x.nombre}</span>
                      <span className="tabular shrink-0 text-ink-100">{formatEuros(x.coste)}</span>
                    </li>
                  ),
                )}
              </ul>
              {editando && (
                <button onClick={() => añadirPieza(p.id)} className="mt-2 self-start text-xs text-ink-400 hover:text-ink-100">
                  + Añadir concepto
                </button>
              )}
            </div>
          </article>
        ))}

        {editando && (
          <button
            onClick={añadirProveedor}
            className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-white/[0.15] text-sm text-ink-400 hover:border-white/[0.3] hover:text-ink-100"
          >
            + Añadir proveedor
          </button>
        )}

        {/* The number that matters: highlighted like the selected tile on the dashboard. */}
        <article className="flex flex-col overflow-hidden rounded-xl border border-accent-500/50 bg-ink-900/80 shadow-soft">
          <header className="bg-accent-500 px-4 py-2.5 text-ink-950">
            <p className="text-[15px] leading-tight font-semibold">Coste total por unidad</p>
          </header>
          <div className="flex flex-1 flex-col px-4 pt-3 pb-4">
            <p className="text-xs text-ink-400">Total</p>
            <p className="tabular mt-0.5 text-3xl font-semibold tracking-tight text-ink-100">{formatEuros(total)}</p>
            <div className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3 text-sm">
              {lista.map((p) => (
                <p key={p.id} className="flex justify-between gap-3">
                  <span className="truncate text-ink-400">{p.nombre || "Proveedor"}</span>
                  <span className="tabular text-ink-300">{formatEuros(subtotal(p))}</span>
                </p>
              ))}
              {cuota !== null && (
                <p className="pt-1 text-xs text-ink-400">
                  = <span className="font-medium text-accent-400">{cuota.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %</span> del precio de venta ({formatEuros(precioVenta)})
                </p>
              )}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
