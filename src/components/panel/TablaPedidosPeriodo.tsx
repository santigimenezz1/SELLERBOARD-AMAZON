"use client";

import { useState } from "react";
import Link from "next/link";
import type { PedidoPeriodo } from "@/lib/datos/ventas";
import type { Marketplace } from "@/lib/datos/tipos";
import { formatEuros, formatNumero } from "@/lib/format";
import { Bandera } from "@/components/Bandera";

/** Orders shown before «Ver más». */
const POR_PAGINA = 25;

const ESTADOS: Record<string, string> = { PENDING: "Pendiente", UNSHIPPED: "Sin enviar", PARTIALLY_SHIPPED: "Enviado en parte", SHIPPED: "Enviado" };

type Props = {
  titulo: string;
  pedidos: PedidoPeriodo[];
  /** How many orders had 1, 2, 3… units. */
  porUnidades: { unidades: number; pedidos: number }[];
  marketplaces: Marketplace[];
  /** Main photo per ASIN. */
  imagenes: Record<string, string>;
  /** One day: the time is enough; longer periods show the date too. */
  unDia: boolean;
};

const uds = (n: number) => `${formatNumero(n)} ${n === 1 ? "ud" : "uds"}`;

/** The selected period's orders, one by one: when, where, what and how many units, with the multi-unit ones standing out. */
export function TablaPedidosPeriodo({ titulo, pedidos, porUnidades, marketplaces, imagenes, unDia }: Props) {
  const [soloVarias, setSoloVarias] = useState(false);
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const mk = new Map(marketplaces.map((m) => [m.id, m]));
  const unidades = pedidos.reduce((s, p) => s + p.unidades, 0);
  const varias = pedidos.filter((p) => p.unidades > 1).length;
  const filas = soloVarias ? pedidos.filter((p) => p.unidades > 1) : pedidos;
  const cuando = (iso: string) =>
    new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", ...(unDia ? {} : { day: "numeric", month: "short" }) });

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-white/[0.06] pb-3">
        <div className="flex items-end gap-6">
          <h2 className="text-lg font-semibold tracking-tight text-ink-100">Pedidos · {titulo}</h2>
          <span className="tabular text-sm text-ink-300">
            {formatNumero(pedidos.length)} {pedidos.length === 1 ? "pedido" : "pedidos"} · {uds(unidades)}
          </span>
        </div>
        {varias > 0 && (
          <button
            onClick={() => {
              setSoloVarias((v) => !v);
              setMostrar(POR_PAGINA);
            }}
            aria-pressed={soloVarias}
            className={`h-8 rounded-lg border px-3 text-xs font-medium transition-colors ${soloVarias ? "border-accent-500/60 bg-accent-500/10 text-accent-300" : "border-white/[0.08] text-ink-300 hover:text-ink-100"}`}
          >
            Solo los de 2 o más uds ({varias})
          </button>
        )}
      </div>

      {porUnidades.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Pedidos según sus unidades">
          {porUnidades.map((x) => (
            <li key={x.unidades} className={`tabular rounded-lg px-3 py-1.5 text-sm ${x.unidades > 1 ? "bg-accent-500/15 font-semibold text-accent-300" : "bg-white/[0.04] text-ink-300"}`}>
              {formatNumero(x.pedidos)} {x.pedidos === 1 ? "pedido" : "pedidos"} de {uds(x.unidades)}
            </li>
          ))}
        </ul>
      )}

      {filas.length === 0 ? (
        <p className="py-12 text-center text-sm text-ink-400">No hay pedidos en este período.</p>
      ) : (
        <>
          <div className="mt-2 overflow-x-auto">
            <table className="tabular w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[13px] text-ink-300">
                  <th scope="col" className="py-3 pr-4 text-left font-medium">
                    {unDia ? "Hora" : "Fecha"}
                  </th>
                  <th scope="col" className="py-3 pr-4 text-left font-medium">
                    Pedido
                  </th>
                  <th scope="col" className="py-3 pr-4 text-left font-medium">
                    Producto
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Unidades
                  </th>
                  <th scope="col" className="py-3 pl-4 text-right font-medium">
                    Venta
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filas.slice(0, mostrar).map((p) => {
                  const m = mk.get(p.marketplaceId);
                  const multiple = p.unidades > 1;
                  return (
                    <tr key={p.amazonOrderId} className={`align-top ${multiple ? "bg-accent-500/[0.05]" : "hover:bg-white/[0.02]"}`}>
                      <td className="py-3 pr-4 whitespace-nowrap text-ink-200">{cuando(p.fecha)}</td>
                      <td className="py-3 pr-4">
                        <span className="flex items-center gap-2">
                          {m && <Bandera codigo={m.codigoPais} className="text-[20px]" />}
                          <span className="font-mono text-xs text-ink-300">{p.amazonOrderId}</span>
                        </span>
                        <span className="mt-0.5 block text-[11px] text-ink-500">{ESTADOS[p.estado] ?? p.estado}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <ul className="flex flex-col gap-2">
                          {p.lineas.map((l, i) => (
                            <li key={`${l.sku}-${i}`} className="flex items-center gap-2.5">
                              <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
                                {imagenes[l.asin] && (
                                  // eslint-disable-next-line @next/next/no-img-element -- Amazon's own sized photo
                                  <img src={imagenes[l.asin]} alt="" loading="lazy" className="size-full object-contain p-0.5" />
                                )}
                              </span>
                              <span className="min-w-0">
                                <span className="line-clamp-1 text-[13px] text-ink-100" title={l.titulo}>
                                  {l.asin ? (
                                    <Link href={`/productos/${l.asin}`} className="hover:text-accent-300 hover:underline">
                                      {l.titulo || l.sku}
                                    </Link>
                                  ) : (
                                    l.titulo || l.sku
                                  )}
                                </span>
                                <span className="block font-mono text-[11px] text-ink-500">
                                  SKU {l.sku}
                                  {p.lineas.length > 1 && ` · ${uds(l.unidades)}`}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-flex min-w-9 justify-center rounded-md px-2 py-0.5 text-base font-semibold ${multiple ? "bg-accent-500/20 text-accent-300" : "text-ink-100"}`}>
                          {formatNumero(p.unidades)}
                        </span>
                      </td>
                      <td className="py-3 pl-4 text-right text-base text-ink-100">{formatEuros(p.ventas)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filas.length > mostrar && (
            <button onClick={() => setMostrar((n) => n + POR_PAGINA * 2)} className="mt-3 h-9 w-full rounded-lg border border-white/[0.08] text-sm text-ink-300 hover:bg-white/[0.03] hover:text-ink-100">
              Ver más pedidos ({formatNumero(filas.length - mostrar)} más)
            </button>
          )}
        </>
      )}
    </section>
  );
}
