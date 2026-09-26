"use client";

import { Fragment, useState } from "react";
import type { ProductoVendido } from "@/lib/datos/panel";
import { formatNumero, formatPorcentaje } from "@/lib/format";
import { Bandera } from "@/components/Bandera";

type Columna = "sku" | "asin" | "unidades";

const COLUMNAS: { clave: Columna; texto: string; numero: boolean }[] = [
  { clave: "sku", texto: "SKU", numero: false },
  { clave: "asin", texto: "ASIN", numero: false },
  { clave: "unidades", texto: "Unidades vendidas", numero: true },
];

type Props = {
  productos: ProductoVendido[];
  /** Amazon site the ASIN links open in (the filtered country's, or amazon.es for all countries). */
  dominio: string;
  /** International view: each row expands to show units per country. */
  desglosePorPais: boolean;
};

/** Simplified phase 1 product list: listing photo, SKU, ASIN and units. */
export function TablaVendidos({ productos, dominio, desglosePorPais }: Props) {
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({ col: "unidades", asc: false });
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const filas = [...productos].sort((a, b) => {
    const cmp = orden.col === "unidades" ? a.unidades - b.unidades : a[orden.col].localeCompare(b[orden.col], "es");
    return orden.asc ? cmp : -cmp;
  });

  const alternar = (sku: string) =>
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(sku)) s.delete(sku);
      else s.add(sku);
      return s;
    });
  const todosAbiertos = filas.length > 0 && filas.every((p) => abiertos.has(p.sku));

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-ink-900/70">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
        <h2 className="text-sm font-medium text-ink-300">Productos vendidos</h2>
        <div className="flex items-center gap-4 text-xs text-ink-400">
          {desglosePorPais && filas.length > 0 && (
            <button onClick={() => setAbiertos(todosAbiertos ? new Set() : new Set(filas.map((p) => p.sku)))} className="underline-offset-4 hover:text-ink-100 hover:underline">
              {todosAbiertos ? "Plegar todos" : "Ver todos por país"}
            </button>
          )}
          <span>{productos.length === 1 ? "1 producto" : `${formatNumero(productos.length)} productos`}</span>
        </div>
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
                      className={`px-3 py-2 font-medium ${c.numero ? "text-right" : "text-left"}`}
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
                <th scope="col" className="w-12 pr-5">
                  <span className="sr-only">Desglose por país</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => {
                const abierto = desglosePorPais && abiertos.has(p.sku);
                const idDesglose = `desglose-${p.sku}`;
                return (
                  <Fragment key={p.sku}>
                    <tr
                      onClick={desglosePorPais ? () => alternar(p.sku) : undefined}
                      className={`border-t border-white/[0.04] ${desglosePorPais ? "cursor-pointer hover:bg-white/[0.03]" : ""} ${abierto ? "bg-white/[0.03]" : ""}`}
                    >
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
                          <a
                            href={`https://${dominio}/dp/${p.asin}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-ink-100 hover:underline"
                          >
                            {p.asin}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-base font-semibold text-ink-100">{formatNumero(p.unidades)}</td>
                      <td className="py-2 pr-5 text-right">
                        {desglosePorPais && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              alternar(p.sku);
                            }}
                            aria-expanded={abierto}
                            aria-controls={idDesglose}
                            aria-label={`${abierto ? "Ocultar" : "Ver"} unidades por país de ${p.sku}`}
                            className="inline-flex size-8 items-center justify-center rounded-lg text-ink-400 hover:bg-white/[0.06] hover:text-ink-100"
                          >
                            <svg viewBox="0 0 16 16" className={`size-4 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`} aria-hidden>
                              <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                    {abierto && (
                      <tr id={idDesglose} className="bg-white/[0.03]">
                        <td />
                        <td colSpan={4} className="pt-1 pr-5 pb-4 pl-3">
                          <DesglosePaises paises={p.porPais} total={p.unidades} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DesglosePaises({ paises, total }: { paises: ProductoVendido["porPais"]; total: number }) {
  return (
    <ul className="grid max-w-xl gap-y-2" aria-label="Unidades por país">
      {paises.map((d) => {
        const cuota = total > 0 ? (d.unidades / total) * 100 : 0;
        return (
          <li key={d.marketplaceId} className="flex items-center gap-3 text-sm">
            <Bandera codigo={d.codigoPais} className="text-base" />
            <span className="w-24 truncate text-ink-300">{d.pais}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
              <span className="block h-full rounded-full bg-serie-ventas" style={{ width: `${Math.max(cuota, 2)}%` }} />
            </span>
            <span className="w-10 text-right font-semibold text-ink-100">{formatNumero(d.unidades)}</span>
            <span className="w-14 text-right text-xs text-ink-400">{formatPorcentaje(cuota)}</span>
          </li>
        );
      })}
    </ul>
  );
}
