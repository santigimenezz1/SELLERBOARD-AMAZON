import Link from "next/link";
import { listarProductos, type ResumenProducto } from "@/lib/datos/productos";
import type { Marketplace } from "@/lib/datos/tipos";
import { ETIQUETAS_POR_ASIN } from "@/lib/datos/etiquetas";
import { formatMoneda, formatNumero } from "@/lib/format";
import { Bandera } from "@/components/Bandera";
import { saludDeProducto } from "@/lib/datos/saludListings";
import { panEuropeoDe } from "@/lib/datos/panEuropeo";
import { modoDemo } from "@/lib/auth/demo";
import { AvisoDemo } from "@/components/AvisoDemo";

/** Every listing we know of, as cards. Built from memory: ~3 Firestore reads per load. */
export default async function ProductosPage({ searchParams }: PageProps<"/productos">) {
  const sp = await searchParams;
  const verTodos = sp.todos === "1";
  // A guest sees it empty: nothing of the owner's is loaded.
  const demo = await modoDemo();
  const { productos, marketplaces } = demo ? { productos: [], marketplaces: [] } : await listarProductos();
  const mk = new Map(marketplaces.map((m) => [m.id, m]));
  const enMercado = (p: ResumenProducto, m: Marketplace) => p.porMercado[m.id];
  // The marketplace chosen in the filter (?mercado=de): every card is then that product as it is in that country.
  // A country can have two (Amazon's own and an internal «stores» one): the one where the products are.
  const delPais = marketplaces.filter((m) => m.codigoPais.toLowerCase() === String(sp.mercado ?? "").toLowerCase());
  const elegido = delPais.find((m) => productos.some((p) => enMercado(p, m))) ?? delPais[0] ?? null;
  const activoEn = (p: ResumenProducto, m: Marketplace) => {
    const v = enMercado(p, m);
    return !!v && (!!v.precio || v.stockVendible > 0 || v.unidades30 > 0);
  };
  const delMercado = elegido ? productos.filter((p) => enMercado(p, elegido)).sort((a, b) => enMercado(b, elegido).unidades30 - enMercado(a, elegido).unidades30) : productos;
  const activos = elegido ? delMercado.filter((p) => activoEn(p, elegido)) : productos.filter((p) => p.activo);
  const visibles = verTodos ? delMercado : activos;
  // Per card: whether the listing can be bought (Amazon's listing status in the chosen country, or in any; without
  // it, whether it has an offer) and whether it is in Pan-European FBA.
  const estados = await Promise.all(
    visibles.map(async (p) => {
      const porMercado = (await saludDeProducto(p.skus)).porMercado;
      const comprable = elegido
        ? (porMercado[elegido.id]?.comprable ?? !!enMercado(p, elegido)?.precio)
        : Object.values(porMercado).length
          ? Object.values(porMercado).some((m) => m.comprable)
          : p.mercadosConOferta.length > 0;
      return { comprable, panEuropeo: await panEuropeoDe(p.skus) };
    }),
  );
  /** This page's link with the filter and the inactive toggle as asked. */
  const enlace = (mercado: string | null, todos: boolean) => {
    const q = new URLSearchParams();
    if (mercado) q.set("mercado", mercado);
    if (todos) q.set("todos", "1");
    return q.size ? `/productos?${q}` : "/productos";
  };
  const codigo = elegido?.codigoPais.toLowerCase() ?? null;
  // The filter offers only the marketplaces where some product is (not Amazon's internal «stores» ones, nor
  // countries you don't sell in), the ones with most active products first.
  const conProductos = marketplaces
    .filter((m) => productos.some((p) => enMercado(p, m)))
    .sort((a, b) => productos.filter((p) => activoEn(p, b)).length - productos.filter((p) => activoEn(p, a)).length);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="mt-1 text-sm text-ink-400">Tus listings tal como los ve un comprador. Pulsa uno para ver la ficha completa.</p>
          {demo && (
            <div className="mt-3">
              <AvisoDemo />
            </div>
          )}
        </div>
        {delMercado.length !== activos.length && (
          <Link href={enlace(codigo, !verTodos)} className="text-sm text-ink-400 underline-offset-4 hover:text-ink-100 hover:underline">
            {verTodos ? "Ver solo activos" : `Ver también inactivos (${delMercado.length - activos.length})`}
          </Link>
        )}
      </div>

      {/* Marketplace filter */}
      {!demo && conProductos.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {[null, ...conProductos].map((m) => {
            const activo = (m?.id ?? null) === (elegido?.id ?? null);
            const n = m ? productos.filter((p) => activoEn(p, m)).length : productos.filter((p) => p.activo).length;
            return (
              <Link
                key={m?.id ?? "todos"}
                href={enlace(m?.codigoPais.toLowerCase() ?? null, verTodos)}
                aria-current={activo ? "page" : undefined}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${activo ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
              >
                {m ? <Bandera codigo={m.codigoPais} className="text-sm" /> : null}
                {m ? m.pais : "Todos los mercados"}
                <span className="text-ink-500">{n}</span>
              </Link>
            );
          })}
        </div>
      )}

      {demo ? (
        // The demo: the cards as they look, with nothing in them.
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <li key={n} className="flex gap-3 rounded-xl border border-white/[0.06] bg-ink-900/70 p-3">
              <div className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-[10px] text-ink-500">Sin foto</div>
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="font-mono text-[11px] text-ink-500">SKU —</p>
                <p className="mt-0.5 text-[13px] text-ink-400">Producto {n}</p>
                <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
                  <p className="tabular text-base font-semibold text-ink-300">— €</p>
                  <p className="tabular text-right text-[11px] leading-tight text-ink-400">
                    <span className="font-semibold text-ink-100">0</span> stock
                    <br />0 uds/30 d
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : visibles.length === 0 ? (
        <p className="rounded-xl border border-white/[0.06] bg-ink-900/70 px-4 py-10 text-center text-sm text-ink-400">
          {elegido ? `No tienes productos activos en Amazon ${elegido.pais}.` : "Aún no hay fichas de productos: aparecerán tras la próxima sincronización."}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibles.map((p, i) => {
            const etiqueta = ETIQUETAS_POR_ASIN[p.asin];
            const { comprable, panEuropeo } = estados[i];
            const v = elegido ? enMercado(p, elegido) : null;
            const titulo = v?.titulo ?? p.titulo;
            const imagen = v?.imagen ?? p.imagen;
            const precio = elegido ? (v?.precio ? { ...v.precio, marketplaceId: elegido.id } : null) : p.precio;
            const stockVendible = v ? v.stockVendible : p.stockVendible;
            const unidades30 = v ? v.unidades30 : p.unidades30;
            const activo = elegido ? activoEn(p, elegido) : p.activo;
            const mercadoPrecio = precio ? mk.get(precio.marketplaceId) : undefined;
            // The Amazon of the chosen country (Spain's when showing all of them).
            const dominio = (elegido ?? mk.get("A1RKKUPIHCS9HS"))?.dominio ?? "www.amazon.es";
            return (
              <li key={p.asin} className="min-w-0">
                {/* Compact card: small photo left, key figures right. The full listing opens on click (a link
                    covering the card, so the Amazon.es link can sit on top of it without nesting links). */}
                <div
                  className={`group relative flex h-full gap-3 rounded-xl border border-white/[0.06] bg-ink-900/70 p-3 transition-colors hover:border-white/[0.16] hover:bg-ink-900 ${activo ? "" : "opacity-60"}`}
                >
                  <Link href={`/productos/${p.asin}`} aria-label={titulo} className="absolute inset-0 z-[1] rounded-xl" />
                  {/* Top left: whether the listing can be bought. */}
                  <span
                    className={`absolute top-1.5 left-1.5 z-10 rounded px-1.5 py-px text-[9px] font-bold tracking-wide shadow-soft ${comprable ? "bg-success text-ink-950" : "bg-danger text-white"}`}
                    title={comprable ? `Se puede comprar en Amazon${elegido ? ` ${elegido.pais}` : ""}` : elegido ? `No se puede comprar ahora mismo en Amazon ${elegido.pais}` : "No se puede comprar ahora mismo en ningún país"}
                  >
                    {comprable ? "ACTIVO" : "NO ACTIVO"}
                  </span>
                  <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
                    {imagen ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imagen} alt="" loading="lazy" className="size-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-ink-600">Sin foto</span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="truncate font-mono text-[11px] text-ink-400">
                      {p.skus.join(", ") || p.asin}
                      {etiqueta && <span className="ml-1.5 rounded bg-success/10 px-1 py-px font-sans text-[10px] font-semibold tracking-wide text-success">{etiqueta}</span>}
                      {panEuropeo !== null && (
                        <span
                          className={`ml-1.5 rounded px-1 py-px font-sans text-[10px] font-semibold tracking-wide ${panEuropeo ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}
                          title={panEuropeo ? "Inscrito en FBA Paneuropeo" : "No está inscrito en FBA Paneuropeo"}
                        >
                          PAN EUROPEO
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-100 group-hover:text-accent-300">{titulo}</p>
                    <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
                      <div className="flex flex-col gap-0.5">
                        {precio ? (
                          <p className="tabular flex items-center gap-1 text-base font-semibold text-ink-100">
                            {mercadoPrecio && <Bandera codigo={mercadoPrecio.codigoPais} className="text-xs" />}
                            {formatMoneda(precio.precio, precio.moneda)}
                          </p>
                        ) : (
                          <p className="text-xs text-ink-400">Sin oferta</p>
                        )}
                        <a
                          href={`https://${dominio}/dp/${p.asin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative z-[2] self-start text-[11px] font-medium text-accent-300 underline-offset-2 hover:underline"
                        >
                          Ver en {dominio.replace(/^www\./, "").replace(/^amazon/, "Amazon")} ↗
                        </a>
                      </div>
                      <p className="tabular text-right text-[11px] leading-tight text-ink-400">
                        <span className="font-semibold text-ink-100">{formatNumero(stockVendible)}</span> stock
                        <br />
                        {formatNumero(unidades30)} uds/30 d
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
