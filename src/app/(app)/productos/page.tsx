import Link from "next/link";
import { listarProductos } from "@/lib/datos/productos";
import { ETIQUETAS_POR_ASIN } from "@/lib/datos/etiquetas";
import { formatEuros, formatMoneda, formatNumero } from "@/lib/format";
import { Bandera } from "@/components/Bandera";

/** Every listing we know of, as cards. Built from memory: ~3 Firestore reads per load. */
export default async function ProductosPage({ searchParams }: PageProps<"/productos">) {
  const sp = await searchParams;
  const verTodos = sp.todos === "1";
  const { productos, marketplaces } = await listarProductos();
  const mk = new Map(marketplaces.map((m) => [m.id, m]));
  const activos = productos.filter((p) => p.activo);
  const visibles = verTodos ? productos : activos;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="mt-1 text-sm text-ink-400">Tus listings tal como los ve un comprador. Pulsa uno para ver la ficha completa.</p>
        </div>
        {productos.length !== activos.length && (
          <Link href={verTodos ? "/productos" : "/productos?todos=1"} className="text-sm text-ink-400 underline-offset-4 hover:text-ink-100 hover:underline">
            {verTodos ? "Ver solo activos" : `Ver también inactivos (${productos.length - activos.length})`}
          </Link>
        )}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-white/[0.06] bg-ink-900/70 px-4 py-10 text-center text-sm text-ink-400">
          Aún no hay fichas de productos: aparecerán tras la próxima sincronización.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((p) => {
            const etiqueta = ETIQUETAS_POR_ASIN[p.asin];
            const mercadoPrecio = p.precio ? mk.get(p.precio.marketplaceId) : undefined;
            return (
              <li key={p.asin}>
                <Link
                  href={`/productos/${p.asin}`}
                  className={`group flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/70 transition-colors hover:border-white/[0.16] ${p.activo ? "" : "opacity-60"}`}
                >
                  <div className="relative flex aspect-[4/3] items-center justify-center bg-white p-4">
                    {p.imagen ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imagen} alt="" loading="lazy" className="size-full object-contain transition-transform duration-300 group-hover:scale-[1.03]" />
                    ) : (
                      <span className="text-sm text-ink-600">Sin foto</span>
                    )}
                    {etiqueta && <span className="absolute top-3 left-3 rounded bg-success px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-ink-950">{etiqueta}</span>}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <p className="font-mono text-[11px] text-ink-400">
                      {p.asin} · {p.skus.join(", ") || "—"}
                    </p>
                    <p className="line-clamp-2 text-[15px] leading-snug text-ink-100">{p.titulo}</p>
                    {p.ranking && (
                      <p className="line-clamp-1 text-xs text-ink-400">
                        Nº {formatNumero(p.ranking.posicion)} en {p.ranking.titulo}
                      </p>
                    )}
                    <div className="mt-auto flex items-end justify-between gap-3 pt-2">
                      <div>
                        {p.precio ? (
                          <p className="tabular flex items-center gap-1.5 text-xl font-semibold text-ink-100">
                            {mercadoPrecio && <Bandera codigo={mercadoPrecio.codigoPais} className="text-sm" />}
                            {formatMoneda(p.precio.precio, p.precio.moneda)}
                          </p>
                        ) : (
                          <p className="text-sm text-ink-400">Sin oferta activa</p>
                        )}
                        {p.mercadosConOferta.length > 1 && <p className="text-[11px] text-ink-400">En venta en {p.mercadosConOferta.length} países</p>}
                      </div>
                      <div className="tabular text-right text-xs text-ink-400">
                        <p>
                          <span className="text-sm font-semibold text-ink-100">{formatNumero(p.stockVendible)}</span> en stock
                        </p>
                        <p>
                          {formatNumero(p.unidades30)} uds · {formatEuros(p.ventas30, 0)} (30 días)
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
