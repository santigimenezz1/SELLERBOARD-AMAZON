import Link from "next/link";
import { notFound } from "next/navigation";
import { listarProductos } from "@/lib/datos/productos";
import { ETIQUETAS_POR_ASIN } from "@/lib/datos/etiquetas";
import { rendimientoBusqueda, type Embudo } from "@/lib/datos/palabrasClave";
import { marketplaceConocido } from "@/lib/datos/marketplacesConocidos";
import { formatMoneda, formatNumero } from "@/lib/format";
import { Bandera } from "@/components/Bandera";

const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")} %`;
const cuota = (tuyo: number, total: number) => (total > 0 ? tuyo / total : 0);
const fecha = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "long", timeZone: "UTC" });
/** Queries shown before «ver todas». */
const PRIMERAS = 15;

/** Change against last week: green up, red down; nothing when last week isn't known. */
function Variacion({ ahora, antes }: { ahora: number; antes: number | null }) {
  if (antes === null || !antes) return null;
  const v = (ahora - antes) / antes;
  if (Math.abs(v) < 0.005) return <span className="text-[11px] text-ink-500">=</span>;
  return <span className={`text-[11px] ${v > 0 ? "text-success" : "text-danger"}`}>{`${v > 0 ? "▲" : "▼"} ${Math.abs(v * 100).toFixed(0)} %`}</span>;
}

/** A horizontal share bar with its percentage. */
function Barra({ valor, color = "#2c90b6" }: { valor: number; color?: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.08]">
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, valor * 100 * 2)}%`, background: color }} />
      </span>
      <span className="tabular">{pct(valor)}</span>
    </span>
  );
}

function Tarjeta({ titulo, color = "#2c90b6", derecha, children }: { titulo: string; color?: string; derecha?: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-white" style={{ background: color }}>
        <h2 className="text-[15px] leading-tight font-semibold">{titulo}</h2>
        {derecha}
      </header>
      {children}
    </article>
  );
}

const Vacio = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-6 text-center text-sm text-ink-400">{children}</p>;

export default async function PalabrasClaveProducto({ params, searchParams }: PageProps<"/palabras-clave/[asin]">) {
  const { asin } = await params;
  const sp = await searchParams;
  const etiqueta = ETIQUETAS_POR_ASIN[asin];
  if (!etiqueta) notFound();
  const producto = (await listarProductos()).productos.find((p) => p.asin === asin);
  const mercados = await rendimientoBusqueda(asin);
  const m = mercados.find((x) => x.marketplaceId === sp.mk) ?? mercados[0];
  const info = marketplaceConocido(m.marketplaceId);
  const verTodas = sp.todas === "1";
  const base = `/palabras-clave/${asin}?mk=${m.marketplaceId}`;

  const qElegida = Math.min(Math.max(0, Number(sp.q) || 0), Math.max(0, m.competidores.length - 1));
  const dominio = m.competidores[qElegida] ?? null;
  // Amazon gives each product's share of the query; the query's totals (same week) turn it into clicks and sales.
  const consultaDominio = dominio ? m.consultas.find((q) => q.busqueda === dominio.busqueda) : undefined;
  const totalQ = consultaDominio?.total ?? { impresiones: 0, clics: 0, carritos: 0, compras: 0 };
  const posicion = (i: number) => {
    const p = m.competidores[i].productos.findIndex((x) => x.esTuyo);
    return p < 0 ? null : p + 1;
  };
  const ganadas = m.competidores.filter((_, i) => posicion(i) === 1).length;

  const c = m.catalogo;
  const a = m.catalogoAnterior;
  const tasa = (e: Embudo) => ({ ctr: cuota(e.clics, e.impresiones), conversion: cuota(e.compras, e.clics) });
  const cifras = c
    ? [
        { titulo: "Impresiones", valor: formatNumero(c.impresiones), ahora: c.impresiones, antes: a?.impresiones ?? null, color: "#3987e5" },
        { titulo: "Clics", valor: formatNumero(c.clics), ahora: c.clics, antes: a?.clics ?? null, color: "#2993ab" },
        { titulo: "CTR", valor: pct(tasa(c).ctr), ahora: tasa(c).ctr, antes: a ? tasa(a).ctr : null, color: "#318dc8" },
        { titulo: "Añadidos al carrito", valor: formatNumero(c.carritos), ahora: c.carritos, antes: a?.carritos ?? null, color: "#21988d" },
        { titulo: "Compras", valor: formatNumero(c.compras), ahora: c.compras, antes: a?.compras ?? null, color: "#199e70" },
        { titulo: "Conversión", valor: pct(tasa(c).conversion), ahora: tasa(c).conversion, antes: a ? tasa(a).conversion : null, color: "#3fb68b" },
      ]
    : [];
  const consultas = verTodas ? m.consultas : m.consultas.slice(0, PRIMERAS);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/palabras-clave" className="text-sm text-ink-400 hover:text-ink-100">
        ← Palabras clave
      </Link>

      {/* Listing */}
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
          {producto?.imagen && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={producto.imagen} alt="" className="size-full object-contain" />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-ink-400">
            {producto?.skus.join(", ") ?? asin} · {asin}
            <span className="ml-1.5 rounded bg-success/10 px-1 py-px font-sans text-[10px] font-semibold tracking-wide text-success">{etiqueta}</span>
          </p>
          <h1 className="line-clamp-1 text-lg font-semibold tracking-tight">{producto?.titulo ?? asin}</h1>
          <p className="text-xs text-ink-400">{m.semana ? `Semana del ${fecha(m.semana.desde)} al ${fecha(m.semana.hasta)} · datos de Amazon Brand Analytics` : "Datos de Amazon Brand Analytics"}</p>
        </div>
      </div>

      {/* Countries */}
      <nav className="flex flex-wrap gap-1.5" aria-label="País">
        {mercados.map((x) => {
          const k = marketplaceConocido(x.marketplaceId);
          const activo = x.marketplaceId === m.marketplaceId;
          return (
            <Link
              key={x.marketplaceId}
              href={`/palabras-clave/${asin}?mk=${x.marketplaceId}`}
              scroll={false}
              aria-current={activo ? "page" : undefined}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${activo ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"} ${x.semana ? "" : "opacity-50"}`}
            >
              {k && <Bandera codigo={k.codigoPais} />}
              {k?.pais ?? x.marketplaceId}
            </Link>
          );
        })}
      </nav>

      {!m.semana ? (
        <p className="rounded-xl border border-white/[0.06] bg-ink-900/70 px-4 py-10 text-center text-sm text-ink-400">
          Aún no hay datos de {info?.pais ?? "este país"}. Se traen solos de Amazon cada semana; la primera carga tarda un rato.
        </p>
      ) : (
        <>
          {/* Listing in search, like the dashboard's period tiles */}
          {c ? (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {cifras.map((x) => (
                <li key={x.titulo} className="overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
                  <p className="px-3 py-1.5 text-xs font-semibold text-white" style={{ background: x.color }}>
                    {x.titulo}
                  </p>
                  <div className="px-3 py-2.5">
                    <p className="tabular text-xl font-semibold text-ink-100">{x.valor}</p>
                    <p className="text-[11px] text-ink-400">{x.antes !== null ? <><Variacion ahora={x.ahora} antes={x.antes} /> vs semana anterior</> : "en el buscador esta semana"}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-white/[0.06] bg-ink-900/70 px-4 py-3 text-sm text-ink-400">Esta semana el listing no tuvo impresiones en el buscador de {info?.pais}.</p>
          )}

          {/* Search queries */}
          <Tarjeta titulo={`Búsquedas que te traen clientes en ${info?.pais ?? ""}`} derecha={<span className="text-xs text-white/80">{m.consultas.length} búsquedas</span>}>
            {m.consultas.length === 0 ? (
              <Vacio>Amazon no registra búsquedas para este listing esta semana.</Vacio>
            ) : (
              <div className="overflow-x-auto">
                <table className="tabular w-full min-w-[860px] text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-xs text-ink-400">
                      <th className="py-2.5 pr-3 pl-4 font-medium">Búsqueda</th>
                      <th className="px-3 py-2.5 text-right font-medium">Búsquedas/semana</th>
                      <th className="px-3 py-2.5 font-medium">Tus impresiones</th>
                      <th className="px-3 py-2.5 font-medium">Tus clics (y % del total)</th>
                      <th className="px-3 py-2.5 font-medium">Tus ventas (y % del total)</th>
                      <th className="px-3 py-2.5 text-right font-medium">Conversión (tú / media)</th>
                      <th className="py-2.5 pr-4 pl-3 text-right font-medium">Precio (tú / media)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {consultas.map((q) => {
                      const imp = cuota(q.tuyo.impresiones, q.total.impresiones);
                      const conv = cuota(q.tuyo.compras, q.tuyo.clics);
                      const convMedia = cuota(q.total.compras, q.total.clics);
                      return (
                        <tr key={q.busqueda}>
                          <td className="py-2.5 pr-3 pl-4 text-ink-100">{q.busqueda}</td>
                          <td className="px-3 py-2.5 text-right text-ink-300">{formatNumero(q.volumen)}</td>
                          <td className="px-3 py-2.5 text-ink-100">
                            <span className="block font-semibold">{formatNumero(q.tuyo.impresiones)}</span>
                            <span className="flex items-center gap-2">
                              <Barra valor={imp} />
                              <Variacion ahora={imp} antes={q.cuotaImpresionesAnterior} />
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-ink-100">
                            <span className="block font-semibold">{formatNumero(q.tuyo.clics)} clics</span>
                            <Barra valor={cuota(q.tuyo.clics, q.total.clics)} color="#2993ab" />
                          </td>
                          <td className="px-3 py-2.5 text-ink-100">
                            <span className="block font-semibold">
                              {formatNumero(q.tuyo.compras)} {q.tuyo.compras === 1 ? "venta" : "ventas"}
                            </span>
                            <Barra valor={cuota(q.tuyo.compras, q.total.compras)} color="#199e70" />
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {q.tuyo.clics > 0 ? <span className={conv >= convMedia ? "text-success" : "text-danger"}>{pct(conv)}</span> : <span className="text-ink-500">—</span>}
                            <span className="text-ink-500"> / {pct(convMedia)}</span>
                          </td>
                          <td className="py-2.5 pr-4 pl-3 text-right">
                            <span className="text-ink-100">{q.tuPrecio !== null ? formatMoneda(q.tuPrecio, m.moneda) : "—"}</span>
                            <span className="text-ink-500"> / {q.precioMediano !== null ? formatMoneda(q.precioMediano, m.moneda) : "—"}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {m.consultas.length > PRIMERAS && (
              <Link href={verTodas ? base : `${base}&todas=1`} scroll={false} className="block border-t border-white/[0.06] px-4 py-2.5 text-center text-sm text-accent-400 hover:text-accent-300">
                {verTodas ? "Ver solo las principales" : `Ver las ${m.consultas.length - PRIMERAS} búsquedas restantes`}
              </Link>
            )}
            <p className="border-t border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[11px] leading-snug text-ink-500">
              Ordenadas por búsquedas de la semana. Tu % de impresiones es la mejor pista de tu posición: si baja de una semana a otra, estás cayendo en esa búsqueda. Conversión en verde: conviertes mejor
              que la media de esa búsqueda.
            </p>
          </Tarjeta>

          {/* Who leads the main queries */}
          <Tarjeta
            titulo={dominio ? `Quién domina «${dominio.busqueda}»` : "Quién domina tus búsquedas"}
            color="#e0a526"
            derecha={
              m.competidores.length > 0 && (
                <span className="text-xs text-white/90">
                  Vas 1º en {ganadas} de {m.competidores.length} búsquedas
                </span>
              )
            }
          >
            {!dominio ? (
              <Vacio>Amazon solo da el top 3 de las búsquedas con suficiente volumen, y ninguna de las tuyas lo tiene esta semana.</Vacio>
            ) : (
              <>
                {/* One chip per main query, with your place in it: green when you lead, red when you're out of the top 3. */}
                <nav aria-label="Búsqueda" className="flex flex-wrap gap-1.5 border-b border-white/[0.06] px-4 py-3">
                  {m.competidores.map((x, i) => {
                    const p = posicion(i);
                    const activa = i === qElegida;
                    const color = p === 1 ? "bg-success text-ink-950" : p ? "bg-warning text-ink-950" : "bg-danger text-white";
                    return (
                      <Link
                        key={x.busqueda}
                        href={`${base}&q=${i}`}
                        scroll={false}
                        aria-current={activa ? "true" : undefined}
                        className={`inline-flex h-8 items-center gap-2 rounded-lg border pr-2.5 pl-1 text-xs transition-colors ${activa ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
                      >
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${color}`}>{p ? `${p}º` : "fuera"}</span>
                        {x.busqueda}
                      </Link>
                    );
                  })}
                </nav>
                <ul className="divide-y divide-white/[0.05]">
                  {dominio.productos.map((p, i) => (
                    <li key={p.asin} className={`flex items-center gap-3 px-4 py-2.5 ${p.esTuyo ? "bg-success/[0.07]" : ""}`}>
                      <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${p.esTuyo ? "bg-success text-ink-950" : "bg-white/[0.08] text-ink-300"}`}>{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${p.esTuyo ? "font-semibold text-success" : p.propio ? "font-semibold text-accent-300" : "text-ink-100"}`}>
                          {p.esTuyo ? `Este listing · ${p.titulo}` : p.propio ? `Tu ${p.propio} · ${p.titulo}` : p.titulo}
                        </span>
                        <a href={`https://${info?.dominio ?? "www.amazon.es"}/dp/${p.asin}`} target="_blank" rel="noopener" className="block font-mono text-[11px] text-ink-500 hover:text-ink-300">
                          {p.asin}
                        </a>
                      </span>
                      <span className="w-36 text-xs text-ink-400">
                        <span className="block">
                          <span className="font-semibold text-ink-100">{formatNumero(Math.round(p.cuotaClics * totalQ.clics))}</span> clics
                        </span>
                        <Barra valor={p.cuotaClics} color="#e0a526" />
                      </span>
                      <span className="w-36 text-xs text-ink-400">
                        <span className="block">
                          <span className="font-semibold text-ink-100">{formatNumero(Math.round(p.cuotaConversiones * totalQ.compras))}</span> ventas
                        </span>
                        <Barra valor={p.cuotaConversiones} color="#3fb68b" />
                      </span>
                    </li>
                  ))}
                  {/* Out of the top 3: your own figures for that query, for comparison. */}
                  {!dominio.productos.some((p) => p.esTuyo) && consultaDominio && (
                    <li className="flex items-center gap-3 bg-danger/[0.07] px-4 py-2.5">
                      <span className="flex h-7 shrink-0 items-center justify-center rounded-full bg-danger px-2 text-[10px] font-bold text-white">fuera</span>
                      <span className="min-w-0 flex-1 text-sm font-semibold text-ink-100">Tu listing</span>
                      <span className="w-36 text-xs text-ink-400">
                        <span className="block">
                          <span className="font-semibold text-ink-100">{formatNumero(consultaDominio.tuyo.clics)}</span> clics
                        </span>
                        <Barra valor={cuota(consultaDominio.tuyo.clics, totalQ.clics)} color="#e0a526" />
                      </span>
                      <span className="w-36 text-xs text-ink-400">
                        <span className="block">
                          <span className="font-semibold text-ink-100">{formatNumero(consultaDominio.tuyo.compras)}</span> ventas
                        </span>
                        <Barra valor={cuota(consultaDominio.tuyo.compras, totalQ.compras)} color="#3fb68b" />
                      </span>
                    </li>
                  )}
                </ul>
                <p className="border-t border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[11px] text-ink-500">
                  Los 3 productos más clicados en cada búsqueda. Amazon da su % de los clics y de las ventas; los números salen de multiplicarlo por el total de la búsqueda. Verde: este listing va 1º · amarillo: 2º o 3º ·
                  rojo: fuera del top 3. En naranja, tu otro listing.
                </p>
              </>
            )}
          </Tarjeta>

          {/* Niche searches not bringing clients yet (Search Terms) */}
          <Tarjeta titulo={`Búsquedas de tu nicho que aún no aprovechas en ${info?.pais ?? ""}`} color="#8b7cf6" derecha={<span className="text-xs text-white/90">{m.oportunidades.length} búsquedas</span>}>
            {m.oportunidades.length === 0 ? (
              <Vacio>No hay búsquedas del nicho con datos esta semana.</Vacio>
            ) : (
              <div className="overflow-x-auto">
                <table className="tabular w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-xs text-ink-400">
                      <th className="py-2.5 pr-3 pl-4 font-medium">Búsqueda</th>
                      <th className="px-3 py-2.5 text-right font-medium">Popularidad en Amazon</th>
                      <th className="px-3 py-2.5 font-medium">Quién se lleva los clics</th>
                      <th className="py-2.5 pr-4 pl-3 text-right font-medium">¿Apareces?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {m.oportunidades.map((o) => (
                      <tr key={o.busqueda}>
                        <td className="py-2.5 pr-3 pl-4 text-ink-100">{o.busqueda}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="text-ink-100">nº {formatNumero(o.ranking)}</span>
                          {o.rankingAnterior !== null && o.rankingAnterior !== o.ranking && (
                            <span className={`ml-1.5 text-[11px] ${o.ranking < o.rankingAnterior ? "text-success" : "text-danger"}`}>{o.ranking < o.rankingAnterior ? "▲ sube" : "▼ baja"}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-ink-300">
                          {o.top.map((t, i) => (
                            <span key={t.asin} className={`block max-w-md truncate ${t.asin === asin ? "font-semibold text-success" : ""}`}>
                              {i + 1}. {t.titulo} <span className="text-ink-500">· {pct(t.cuotaClics)}</span>
                            </span>
                          ))}
                        </td>
                        <td className="py-2.5 pr-4 pl-3 text-right">
                          {o.tuPosicion ? (
                            <span className="rounded-md bg-warning px-1.5 py-0.5 text-[11px] font-bold text-ink-950">{o.tuPosicion}º</span>
                          ) : (
                            <span className="rounded-md bg-danger px-1.5 py-0.5 text-[11px] font-bold text-white">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="border-t border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[11px] leading-snug text-ink-500">
              Las búsquedas más hechas de tu nicho (de todo Amazon) en las que tu listing no consiguió clics esta semana. Popularidad: nº 1 = la búsqueda más hecha del país. Ideas: añadir estas palabras
              al título, bullets o términos ocultos del listing, o hacer publicidad en ellas.
            </p>
          </Tarjeta>

          {/* Products bought together */}
          <Tarjeta titulo={`Cesta de la compra en ${info?.pais ?? ""}`} color="#3fb68b" derecha={<span className="text-xs text-white/90">Market Basket Analysis</span>}>
            {m.cesta.length === 0 ? (
              <Vacio>Esta semana ningún pedido de tu listing incluyó otros productos.</Vacio>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {m.cesta.map((p, i) => (
                  <li key={p.asin} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-bold text-ink-300">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink-100">{p.titulo}</span>
                      <a href={`https://${info?.dominio ?? "www.amazon.es"}/dp/${p.asin}`} target="_blank" rel="noopener" className="block font-mono text-[11px] text-ink-500 hover:text-ink-300">
                        {p.asin}
                      </a>
                    </span>
                    <span className="w-40 text-xs text-ink-400">
                      <span className="block">% de combinación</span>
                      <Barra valor={p.porcentaje} color="#3fb68b" />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[11px] leading-snug text-ink-500">
              Los 3 productos que más se compraron junto con tu listing esta semana, con el % de combinación que da Amazon. Con pocos pedidos en la semana, cada pedido pesa mucho en el porcentaje. Ideas: un
              pack con ellos, un producto nuevo para tu marca o anuncios en sus fichas.
            </p>
          </Tarjeta>
        </>
      )}
    </div>
  );
}
