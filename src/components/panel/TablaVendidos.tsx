"use client";

import { useState } from "react";
import type { ProductoVendido } from "@/lib/datos/panel";
import { formatNumero } from "@/lib/format";

type Columna = "sku" | "asin" | "unidades";

const COLUMNAS: { clave: Columna; texto: string; numero: boolean }[] = [
  { clave: "sku", texto: "SKU", numero: false },
  { clave: "asin", texto: "ASIN", numero: false },
  { clave: "unidades", texto: "Unidades vendidas", numero: true },
];

/** Simplified phase 1 product list: listing photo, SKU, ASIN and units. */
/** `dominio`: Amazon site the ASIN links open in (the filtered country's, or amazon.es for all countries). */
export function TablaVendidos({ productos, dominio }: { productos: ProductoVendido[]; dominio: string }) {
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({ col: "unidades", asc: false });

  const filas = [...productos].sort((a, b) => {
    const cmp = orden.col === "unidades" ? a.unidades - b.unidades : a[orden.col].localeCompare(b[orden.col], "es");
    return orden.asc ? cmp : -cmp;
  });

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-ink-900/70">
      <div className="flex items-center justify-between gap-2 px-5 pt-5">
        <h2 className="text-sm font-medium text-ink-300">Productos vendidos</h2>
        <p className="text-xs text-ink-400">{productos.length === 1 ? "1 producto" : `${formatNumero(productos.length)} productos`}</p>
      </div>

      {filas.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-ink-400">No hay ventas en este rango.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="tabular w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-xs text-ink-400">
                <th scope="col" className="w-20 py-2 pl-5 text-left font-medium">
                  <span className="sr-only">Foto</span>
                </th>
                {COLUMNAS.map((c) => {
                  const activa = orden.col === c.clave;
                  return (
                    <th
                      key={c.clave}
                      scope="col"
                      aria-sort={activa ? (orden.asc ? "ascending" : "descending") : "none"}
                      className={`px-3 py-2 font-medium last:pr-5 ${c.numero ? "text-right" : "text-left"}`}
                    >
                      <button
                        onClick={() => setOrden((o) => (o.col === c.clave ? { col: c.clave, asc: !o.asc } : { col: c.clave, asc: c.clave !== "unidades" }))}
                        className={`inline-flex items-center gap-1 hover:text-ink-100 ${activa ? "text-ink-100" : ""}`}
                      >
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
                <tr key={p.sku} className="hover:bg-white/[0.02]">
                  <td className="py-2 pl-5">
                    <div className="flex size-14 items-center justify-center overflow-hidden rounded-lg bg-white">
                      {p.imagen ? (
                        // Amazon's image CDN already serves sized JPEGs: a plain <img> avoids proxying them through Next.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imagen} alt={p.titulo || p.sku} title={p.titulo} loading="lazy" className="size-full object-contain p-1" />
                      ) : (
                        <span className="text-[10px] text-ink-600" title="La foto se descarga en la próxima sincronización">
                          Sin foto
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-[13px] text-ink-100" title={p.titulo}>
                    {p.sku}
                  </td>
                  <td className="px-3 py-2 font-mono text-[13px] text-ink-300">
                    {p.asin ? (
                      <a href={`https://${dominio}/dp/${p.asin}`} target="_blank" rel="noopener noreferrer" className="hover:text-ink-100 hover:underline">
                        {p.asin}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-5 pl-3 text-right text-base font-semibold text-ink-100">{formatNumero(p.unidades)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
