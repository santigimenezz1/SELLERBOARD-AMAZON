"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ArticuloStock, CantidadesStock, Stock } from "@/lib/datos/stock";
import { ETIQUETAS_POR_ASIN } from "@/lib/datos/etiquetas";
import { formatFechaHora, formatNumero } from "@/lib/format";
import { Spinner } from "@/components/Spinner";

type Props = { stock: Stock | null; imagenes: Record<string, string>; titulos: Record<string, string> };

const CERO: CantidadesStock = { total: 0, vendible: 0, reservado: 0, enCamino: 0, noVendible: 0, investigando: 0 };

function sumar(a: ArticuloStock): CantidadesStock {
  return Object.values(a.porRegion).reduce(
    (s, c) => ({
      total: s.total + c.total,
      vendible: s.vendible + c.vendible,
      reservado: s.reservado + c.reservado,
      enCamino: s.enCamino + c.enCamino,
      noVendible: s.noVendible + c.noVendible,
      investigando: s.investigando + c.investigando,
    }),
    CERO,
  );
}

/** Stock page: region totals on top, one row per SKU below (only SKUs with stock unless asked). */
export function VistaStock({ stock, imagenes, titulos }: Props) {
  const router = useRouter();
  const [estado, setEstado] = useState<{ tipo: "idle" | "cargando" } | { tipo: "error"; msg: string }>({ tipo: "idle" });
  const [verTodos, setVerTodos] = useState(false);

  async function actualizar() {
    setEstado({ tipo: "cargando" });
    try {
      const res = await fetch("/api/stock", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; avisos?: string[] };
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
      // Stock updated; a part that failed (shipments, per-country report) is still worth showing.
      setEstado(body.avisos?.length ? { tipo: "error", msg: `Stock actualizado, pero falló: ${body.avisos.join(" · ")}` } : { tipo: "idle" });
      router.refresh();
    } catch (e) {
      setEstado({ tipo: "error", msg: e instanceof Error ? e.message : "Error" });
    }
  }

  const boton = (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={actualizar}
        disabled={estado.tipo === "cargando"}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent-500 px-3.5 text-sm font-medium whitespace-nowrap text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow disabled:cursor-wait disabled:opacity-70"
      >
        {estado.tipo === "cargando" ? <Spinner tamano="sm" /> : <span aria-hidden>↻</span>}
        {estado.tipo === "cargando" ? "Consultando a Amazon…" : "Actualizar stock"}
      </button>
      {stock && <span className="text-xs text-ink-400">Actualizado: {formatFechaHora(new Date(stock.actualizadoEn))}</span>}
      {estado.tipo === "error" && (
        <span role="alert" className="text-sm text-danger">
          {estado.msg}
        </span>
      )}
    </div>
  );

  if (!stock) {
    return (
      <div className="flex flex-col gap-4">
        {boton}
        <p className="rounded-xl border border-white/[0.06] bg-ink-900/70 px-4 py-10 text-center text-sm text-ink-400">
          Aún no hay datos de stock. Pulsa <strong className="text-ink-100">Actualizar stock</strong> o sincroniza desde el panel.
        </p>
      </div>
    );
  }

  const conTotales = stock.articulos.map((a) => ({ a, t: sumar(a) }));
  const conStock = conTotales.filter(({ t }) => t.total > 0 || t.enCamino > 0);
  const filas = (verTodos ? conTotales : conStock).sort((x, y) => y.t.vendible - x.t.vendible || x.a.sku.localeCompare(y.a.sku));
  const total = conTotales.reduce((s, { t }) => sumar({ sku: "", asin: "", nombre: "", porRegion: { a: s, b: t } }), CERO);
  const porRegion = stock.regiones.map((r) => ({ r, vendible: stock.articulos.reduce((s, a) => s + (a.porRegion[r.id]?.vendible ?? 0), 0) }));

  type Tarjeta = { titulo: string; valor: number; grande?: boolean; bandera?: string; nota?: string };
  const tarjetas: Tarjeta[] = [
    { titulo: "Vendible total", valor: total.vendible, grande: true },
    ...porRegion.map(({ r, vendible }) => ({ titulo: `Vendible · ${r.nombre}`, valor: vendible, bandera: r.bandera, nota: r.paises.length > 1 ? r.paises.join(" · ") : undefined })),
    { titulo: "En camino a Amazon", valor: total.enCamino },
    { titulo: "Reservado", valor: total.reservado, nota: "pedidos, traslados y proceso" },
    { titulo: "No vendible", valor: total.noVendible + total.investigando, nota: total.investigando ? `incluye ${formatNumero(total.investigando)} en investigación` : undefined },
  ];

  return (
    <div className="flex flex-col gap-6">
      {boton}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
        {tarjetas.map((t) => (
          <section key={t.titulo} className={`rounded-xl border p-4 ${t.grande ? "border-accent-500/40 bg-accent-500/[0.07]" : "border-white/[0.06] bg-ink-900/70"}`}>
            <h2 className="flex items-center gap-1.5 text-xs text-ink-400">
              {t.bandera && <span aria-hidden className={`fi fi-${t.bandera} rounded-[2px]`} />}
              {t.titulo}
            </h2>
            <p className={`tabular mt-1 font-semibold tracking-tight text-ink-100 ${t.grande ? "text-3xl" : "text-2xl"}`}>{formatNumero(t.valor)}</p>
            {t.nota && <p className="mt-0.5 text-[11px] text-ink-400">{t.nota}</p>}
          </section>
        ))}
      </div>

      {/* Section title outside the card, like the product page sections. */}
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold tracking-tight text-ink-100">Productos en stock</h2>
          <p className="text-xs text-ink-400">Unidades de cada producto en los almacenes de Amazon, por región.</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-ink-900/70">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
            <h3 className="text-sm font-medium text-ink-300">
              {verTodos ? `Todos los productos (${stock.articulos.length})` : `Con stock (${conStock.length})`}
            </h3>
            {conTotales.length !== conStock.length && (
              <button onClick={() => setVerTodos((v) => !v)} className="text-xs text-ink-400 underline-offset-4 hover:text-ink-100 hover:underline">
                {verTodos ? "Ver solo con stock" : `Ver también sin stock (${conTotales.length - conStock.length})`}
              </button>
            )}
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="tabular w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-xs text-ink-400">
                  <th scope="col" className="py-2.5 pr-3 pl-5 text-left font-medium">
                    Producto
                  </th>
                  {stock.regiones.map((r) => (
                    <th key={r.id} scope="col" className="px-3 py-2.5 text-right font-medium" title={r.paises.join(", ")}>
                      <span className="inline-flex items-center gap-1.5">
                        {r.bandera && <span aria-hidden className={`fi fi-${r.bandera} rounded-[2px]`} />}
                        {r.nombre}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2.5 text-right font-medium text-ink-100">
                    Vendible total
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    Reservado
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    En camino
                  </th>
                  <th scope="col" className="py-2.5 pr-5 pl-3 text-right font-medium">
                    No vendible
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filas.map(({ a, t }) => {
                  const titulo = titulos[a.sku] || a.nombre;
                  const etiqueta = ETIQUETAS_POR_ASIN[a.asin];
                  return (
                    <tr key={a.sku} className={t.total === 0 && t.enCamino === 0 ? "opacity-50" : "hover:bg-white/[0.02]"}>
                      <td className="py-3 pr-3 pl-5">
                        <div className="flex items-center gap-3">
                          <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
                            {imagenes[a.asin] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={imagenes[a.asin]} alt="" loading="lazy" className="size-full object-contain p-1" />
                            ) : (
                              <span className="text-[9px] text-ink-600">Sin foto</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-mono text-xs text-ink-400">
                              {a.asin}
                              <span className="font-sans"> · SKU </span>
                              <span className="text-ink-100">{a.sku}</span>
                              {etiqueta && (
                                <span className="ml-2 rounded bg-success/10 px-1.5 py-0.5 font-sans text-[11px] font-semibold tracking-wide text-success">{etiqueta}</span>
                              )}
                            </p>
                            <p className="mt-0.5 line-clamp-1 max-w-[420px] text-[13px] text-ink-300" title={titulo}>
                              {titulo || "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      {stock.regiones.map((r) => (
                        <td key={r.id} className="px-3 py-3 text-right text-base text-ink-100">
                          {formatNumero(a.porRegion[r.id]?.vendible ?? 0)}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right text-lg font-semibold text-ink-100">{formatNumero(t.vendible)}</td>
                      <td className="px-3 py-3 text-right text-ink-300">{formatNumero(t.reservado)}</td>
                      <td className="px-3 py-3 text-right text-ink-300">{t.enCamino > 0 ? <span className="font-medium text-accent-400">{formatNumero(t.enCamino)}</span> : "0"}</td>
                      <td className="py-3 pr-5 pl-3 text-right text-ink-300">{formatNumero(t.noVendible + t.investigando)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
