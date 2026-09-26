import Link from "next/link";
import { listarProductos } from "@/lib/datos/productos";
import { ETIQUETAS_POR_ASIN } from "@/lib/datos/etiquetas";
import { formatMoneda, formatNumero } from "@/lib/format";
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
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibles.map((p) => {
            const etiqueta = ETIQUETAS_POR_ASIN[p.asin];
            const mercadoPrecio = p.precio ? mk.get(p.precio.marketplaceId) : undefined;
            return (
              <li key={p.asin}>
                {/* Compact card: small photo left, key figures right. The full listing opens on click. */}
                <Link
                  href={`/productos/${p.asin}`}
                  className={`group flex h-full gap-3 rounded-xl border border-white/[0.06] bg-ink-900/70 p-3 transition-colors hover:border-white/[0.16] hover:bg-ink-900 ${p.activo ? "" : "opacity-60"}`}
                >
                  <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
                    {p.imagen ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imagen} alt="" loading="lazy" className="size-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-ink-600">Sin foto</span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="truncate font-mono text-[11px] text-ink-400">
                      {p.skus.join(", ") || p.asin}
                      {etiqueta && <span className="ml-1.5 rounded bg-success/10 px-1 py-px font-sans text-[10px] font-semibold tracking-wide text-success">{etiqueta}</span>}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-100 group-hover:text-accent-300">{p.titulo}</p>
                    <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
                      {p.precio ? (
                        <p className="tabular flex items-center gap-1 text-base font-semibold text-ink-100">
                          {mercadoPrecio && <Bandera codigo={mercadoPrecio.codigoPais} className="text-xs" />}
                          {formatMoneda(p.precio.precio, p.precio.moneda)}
                        </p>
                      ) : (
                        <p className="text-xs text-ink-400">Sin oferta</p>
                      )}
                      <p className="tabular text-right text-[11px] leading-tight text-ink-400">
                        <span className="font-semibold text-ink-100">{formatNumero(p.stockVendible)}</span> stock
                        <br />
                        {formatNumero(p.unidades30)} uds/30 d
                      </p>
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
