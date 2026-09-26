"use client";

import { useState } from "react";
import type { ProductoVendido } from "@/lib/datos/panel";
import { formatNumero } from "@/lib/format";
import { Bandera } from "@/components/Bandera";

type Columna = "sku" | "asin" | "unidades";

const ORDENES: { clave: Columna; texto: string }[] = [
  { clave: "unidades", texto: "Unidades" },
  { clave: "sku", texto: "SKU" },
  { clave: "asin", texto: "ASIN" },
];

type Props = {
  productos: ProductoVendido[];
  /** Amazon site the ASIN links open in (the filtered country's, or amazon.es for all countries). */
  dominio: string;
  /** International view: each card also shows the units sold in every country. */
  desglosePorPais: boolean;
};

/** Simplified phase 1 product list: one card per product with photo, SKU, ASIN, units and (internationally) units per country. */
export function TablaVendidos({ productos, dominio, desglosePorPais }: Props) {
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({ col: "unidades", asc: false });

  const filas = [...productos].sort((a, b) => {
    const cmp = orden.col === "unidades" ? a.unidades - b.unidades : a[orden.col].localeCompare(b[orden.col], "es");
    return orden.asc ? cmp : -cmp;
  });

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-ink-300">
          Productos vendidos <span className="text-ink-400">· {formatNumero(productos.length)}</span>
        </h2>
        {filas.length > 1 && (
          <div role="group" aria-label="Ordenar por" className="flex items-center gap-1 text-xs text-ink-400">
            <span className="mr-1">Ordenar por</span>
            {ORDENES.map((o) => {
              const activo = orden.col === o.clave;
              return (
                <button
                  key={o.clave}
                  onClick={() => setOrden((p) => (p.col === o.clave ? { col: o.clave, asc: !p.asc } : { col: o.clave, asc: o.clave !== "unidades" }))}
                  aria-pressed={activo}
                  className={`h-7 rounded-md px-2 transition-colors ${activo ? "bg-white/[0.09] text-ink-100" : "hover:text-ink-100"}`}
                >
                  {o.texto}
                  {activo && <span aria-hidden> {orden.asc ? "↑" : "↓"}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {filas.length === 0 ? (
        <p className="rounded-2xl border border-white/[0.06] bg-ink-900/70 px-5 py-10 text-center text-sm text-ink-400">No hay ventas en este rango.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filas.map((p) => (
            <li key={p.sku} className="rounded-2xl border border-white/[0.06] bg-ink-900/70 p-4">
              <div className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
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

                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm text-ink-100" title={p.titulo}>
                    {p.sku}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-ink-400">
                    {p.asin ? (
                      <a href={`https://${dominio}/dp/${p.asin}`} target="_blank" rel="noopener noreferrer" className="hover:text-ink-100 hover:underline">
                        {p.asin}
                      </a>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>

                <div className="text-right">
                  <p className="tabular text-2xl font-semibold text-ink-100">{formatNumero(p.unidades)}</p>
                  <p className="text-xs text-ink-400">{p.unidades === 1 ? "unidad" : "unidades"}</p>
                </div>
              </div>

              {desglosePorPais && p.porPais.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-3 border-t border-white/[0.05] pt-4" aria-label={`Unidades por país de ${p.sku}`}>
                  {p.porPais.map((d) => (
                    <li key={d.marketplaceId} className="flex items-center gap-2.5" title={d.pais}>
                      <Bandera codigo={d.codigoPais} className="text-[28px] shadow-sm" />
                      <span className="sr-only">{d.pais}:</span>
                      <span className="tabular text-lg font-semibold text-ink-100">{formatNumero(d.unidades)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
