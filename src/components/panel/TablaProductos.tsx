"use client";

import { useState } from "react";
import Link from "next/link";
import type { FilaProducto } from "@/lib/datos/panel";
import { formatEuros, formatNumero, formatPorcentaje } from "@/lib/format";

type Columna = "titulo" | "unidades" | "ventas" | "comisiones" | "reembolsos" | "coste" | "beneficio" | "margen";

const COLUMNAS: { clave: Columna; texto: string; numero: boolean }[] = [
  { clave: "titulo", texto: "Producto", numero: false },
  { clave: "unidades", texto: "Unidades", numero: true },
  { clave: "ventas", texto: "Ventas", numero: true },
  { clave: "comisiones", texto: "Comisiones", numero: true },
  { clave: "reembolsos", texto: "Reembolsos", numero: true },
  { clave: "coste", texto: "Coste", numero: true },
  { clave: "beneficio", texto: "Beneficio neto", numero: true },
  { clave: "margen", texto: "Margen", numero: true },
];

export function TablaProductos({ productos }: { productos: FilaProducto[] }) {
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({ col: "ventas", asc: false });

  const filas = [...productos].sort((a, b) => {
    const va = orden.col === "titulo" ? a.titulo || a.sku : a[orden.col];
    const vb = orden.col === "titulo" ? b.titulo || b.sku : b[orden.col];
    // Rows without a value (missing cost) always go last, whatever the direction.
    if (va === null) return vb === null ? 0 : 1;
    if (vb === null) return -1;
    const cmp = typeof va === "string" ? va.localeCompare(vb as string, "es") : va - (vb as number);
    return orden.asc ? cmp : -cmp;
  });

  function ordenarPor(col: Columna) {
    setOrden((o) => (o.col === col ? { col, asc: !o.asc } : { col, asc: col === "titulo" }));
  }

  const sinCoste = productos.filter((p) => p.faltaCoste).length;

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-ink-900/70">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
        <h2 className="text-sm font-medium text-ink-300">Desglose por producto</h2>
        {sinCoste > 0 && (
          <Link href="/costes" className="text-xs text-warning underline-offset-4 hover:underline">
            ⚠ {sinCoste === 1 ? "1 producto sin coste" : `${sinCoste} productos sin coste`} · configurar
          </Link>
        )}
      </div>

      {filas.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-ink-400">No hay ventas en este rango.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="tabular w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-xs text-ink-400">
                {COLUMNAS.map((c) => {
                  const activa = orden.col === c.clave;
                  return (
                    <th
                      key={c.clave}
                      scope="col"
                      aria-sort={activa ? (orden.asc ? "ascending" : "descending") : "none"}
                      className={`px-3 py-2 font-medium first:pl-5 last:pr-5 ${c.numero ? "text-right" : "text-left"}`}
                    >
                      <button onClick={() => ordenarPor(c.clave)} className={`inline-flex items-center gap-1 hover:text-ink-100 ${activa ? "text-ink-100" : ""}`}>
                        {c.texto}
                        <span aria-hidden className={activa ? "" : "opacity-0"}>
                          {orden.asc ? "↑" : "↓"}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filas.map((p) => (
                <tr key={p.sku} className={p.faltaCoste ? "bg-warning/[0.04]" : "hover:bg-white/[0.02]"}>
                  <td className="max-w-[340px] py-2.5 pr-3 pl-5">
                    <p className="truncate text-ink-100" title={p.titulo}>
                      {p.titulo || p.sku}
                    </p>
                    <p className="truncate font-mono text-[11px] text-ink-400">
                      {p.sku}
                      {p.asin && ` · ${p.asin}`}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-right">{formatNumero(p.unidades)}</td>
                  <td className="px-3 py-2.5 text-right">{formatEuros(p.ventas)}</td>
                  <td className="px-3 py-2.5 text-right text-ink-300">{formatEuros(p.comisiones)}</td>
                  <td className="px-3 py-2.5 text-right text-ink-300">{formatEuros(p.reembolsos)}</td>
                  {p.faltaCoste ? (
                    <td colSpan={3} className="py-2.5 pr-5 pl-3 text-right">
                      <Link href="/costes" className="inline-flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-0.5 text-xs text-warning hover:bg-warning/15">
                        <span aria-hidden>⚠</span> Falta coste de producto
                      </Link>
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2.5 text-right text-ink-300">{formatEuros(p.coste)}</td>
                      <td className={`px-3 py-2.5 text-right font-medium ${p.beneficio !== null && p.beneficio < 0 ? "text-danger" : "text-ink-100"}`}>{formatEuros(p.beneficio)}</td>
                      <td className="py-2.5 pr-5 pl-3 text-right text-ink-300">{formatPorcentaje(p.margen)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
