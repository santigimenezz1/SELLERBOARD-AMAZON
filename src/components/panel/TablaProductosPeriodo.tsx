"use client";

import { useState } from "react";
import type { ProductoPeriodo } from "@/lib/datos/ventas";
import type { Marketplace } from "@/lib/datos/tipos";
import { formatEuros, formatNumero } from "@/lib/format";
import { Bandera } from "@/components/Bandera";

type Columna = "unidades" | "reembolsos" | "ventas" | "precioMedio";

type Props = {
  titulo: string;
  productos: ProductoPeriodo[];
  marketplaces: Marketplace[];
  /** Amazon site ASIN links open in: the filtered market's, or amazon.es for all markets. */
  dominio: string;
  /** All markets: each product also shows its units per country. */
  desglosePorPais: boolean;
};

/** Products sold in the selected period, laid out like Seller Central / Sellerboard. */
export function TablaProductosPeriodo({ titulo, productos, marketplaces, dominio, desglosePorPais }: Props) {
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({ col: "unidades", asc: false });
  const mk = new Map(marketplaces.map((m) => [m.id, m]));

  const filas = [...productos].sort((a, b) => (orden.asc ? 1 : -1) * ((a[orden.col] ?? -1) - (b[orden.col] ?? -1) || a.ventas - b.ventas));

  const cabecera = (col: Columna, texto: React.ReactNode) => {
    const activa = orden.col === col;
    return (
      <th scope="col" aria-sort={activa ? (orden.asc ? "ascending" : "descending") : "none"} className="px-4 py-3 text-right align-bottom font-medium">
        <button onClick={() => setOrden((o) => (o.col === col ? { col, asc: !o.asc } : { col, asc: false }))} className={`inline-flex items-end gap-1 text-right leading-tight hover:text-ink-100 ${activa ? "text-ink-100" : ""}`}>
          {texto}
          <span aria-hidden className={activa ? "" : "opacity-0"}>
            {orden.asc ? "↑" : "↓"}
          </span>
        </button>
      </th>
    );
  };

  return (
    <section>
      <div className="flex items-end gap-6 border-b border-white/[0.06]">
        <h2 className="pb-3 text-lg font-semibold tracking-tight text-ink-100">{titulo}</h2>
        <span className="flex items-center gap-2 border-b-2 border-accent-500 pb-3 text-sm font-medium text-accent-400">
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
            <rect x="3" y="2" width="10" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M6 1.5h4v2H6z" fill="currentColor" />
          </svg>
          Productos
        </span>
      </div>

      {filas.length === 0 ? (
        <p className="py-12 text-center text-sm text-ink-400">No hay ventas en este período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[13px] text-ink-300">
                <th scope="col" className="py-3 pr-4 text-left align-bottom font-medium">
                  Producto
                </th>
                {cabecera("unidades", "Unidades")}
                {cabecera("reembolsos", "Reembolsos")}
                {cabecera("ventas", "Ventas")}
                {cabecera(
                  "precioMedio",
                  <>
                    Precio medio
                    <br />
                    de venta
                  </>,
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filas.map((p) => (
                <tr key={p.sku} className="align-top hover:bg-white/[0.02]">
                  <td className="py-3 pr-4">
                    <div className="flex gap-3">
                      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
                        {p.imagen ? (
                          // Amazon's image CDN already serves sized JPEGs: a plain <img> avoids proxying them through Next.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imagen} alt="" loading="lazy" className="size-full object-contain p-1" />
                        ) : (
                          <span className="text-[10px] text-ink-600" title="La foto se descarga en la próxima sincronización">
                            Sin foto
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs text-ink-400">
                          {p.asin ? (
                            <a href={`https://${dominio}/dp/${p.asin}`} target="_blank" rel="noopener noreferrer" className="hover:text-ink-100 hover:underline">
                              {p.asin}
                            </a>
                          ) : (
                            "—"
                          )}
                          <span className="font-sans"> · SKU </span>
                          {p.sku}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-[14px] text-ink-100" title={p.titulo}>
                          {p.titulo || p.sku}
                        </p>
                        {desglosePorPais && p.porMarketplace.length > 0 && (
                          <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2" aria-label="Unidades por mercado">
                            {p.porMarketplace.map((d) => {
                              const m = mk.get(d.marketplaceId);
                              return (
                                <li key={d.marketplaceId} className="flex items-center gap-1.5" title={m?.pais ?? d.marketplaceId}>
                                  {m ? <Bandera codigo={m.codigoPais} className="text-[24px]" /> : <span className="text-xs text-ink-400">{d.marketplaceId}</span>}
                                  <span className="sr-only">{m?.pais}:</span>
                                  <span className="text-[15px] font-semibold text-ink-100">{formatNumero(d.unidades)}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-base font-semibold text-ink-100">{formatNumero(p.unidades)}</td>
                  <td className={`px-4 py-3 text-right text-base ${p.reembolsos > 0 ? "font-medium text-accent-400" : "text-ink-100"}`}>{formatNumero(p.reembolsos)}</td>
                  <td className="px-4 py-3 text-right text-base text-ink-100">{formatEuros(p.ventas)}</td>
                  <td className="px-4 py-3 text-right text-base text-ink-100">{formatEuros(p.precioMedio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
