import Link from "next/link";
import { notFound } from "next/navigation";
import { listarProductos } from "@/lib/datos/productos";
import { ETIQUETAS_POR_ASIN } from "@/lib/datos/etiquetas";
import { DATOS_DE_EJEMPLO, rendimientoBusqueda, type Embudo } from "@/lib/datos/palabrasClave";
import { marketplaceConocido } from "@/lib/datos/marketplacesConocidos";
import { formatMoneda, formatNumero } from "@/lib/format";
import { Bandera } from "@/components/Bandera";

const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")} %`;
const cuota = (tuyo: number, total: number) => (total > 0 ? tuyo / total : 0);
const fecha = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "long", timeZone: "UTC" });

/** Change against last week: green up, red down. */
function Variacion({ ahora, antes }: { ahora: number; antes: number }) {
  if (!antes) return null;
  const v = (ahora - antes) / antes;
  if (Math.abs(v) < 0.005) return <span className="text-[11px] text-ink-500">=</span>;
  return <span className={`text-[11px] ${v > 0 ? "text-success" : "text-danger"}`}>{`${v > 0 ? "▲" : "▼"} ${Math.abs(v * 100).toFixed(0)} %`}</span>;
}

/** A horizontal share bar with its percentage. */
function Barra({ valor, color = "#2c90b6" }: { valor: number; color?: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.08]">
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, valor * 100 * 3)}%`, background: color }} />
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

export default async function PalabrasClaveProducto({ params, searchParams }: PageProps<"/palabras-clave/[asin]">) {
  const { asin } = await params;
  const sp = await searchParams;
  const etiqueta = ETIQUETAS_POR_ASIN[asin];
  if (!etiqueta) notFound();
  const producto = (await listarProductos()).productos.find((p) => p.asin === asin);
  const mercados = await rendimientoBusqueda(asin, etiqueta === "LISTING NUEVO");
  const m = mercados.find((x) => x.marketplaceId === sp.mk) ?? mercados[0];
  const info = marketplaceConocido(m.marketplaceId);
  const qElegida = Math.min(Math.max(0, Number(sp.q) || 0), m.competidores.length - 1);
  const dominio = m.competidores[qElegida];
  // Amazon gives each product's share; the query's totals (same week) turn it into clicks and sales.
  const totalQ = m.consultas.find((q) => q.busqueda === dominio.busqueda)?.total ?? { impresiones: 0, clics: 0, carritos: 0, compras: 0 };
  const posicion = (i: number) => {
    const p = m.competidores[i].productos.findIndex((x) => x.esTuyo);
    return p < 0 ? null : p + 1;
  };
  const ganadas = m.competidores.filter((_, i) => posicion(i) === 1).length;

  const c = m.catalogo;
  const tasa = (e: Embudo) => ({ ctr: cuota(e.clics, e.impresiones), conversion: cuota(e.compras, e.clics) });
  const ahora = tasa(c);
  const antes = tasa(m.catalogoAnterior);
  const cifras = [
    { titulo: "Impresiones", valor: formatNumero(c.impresiones), ahora: c.impresiones, antes: m.catalogoAnterior.impresiones, color: "#3987e5" },
    { titulo: "Clics", valor: formatNumero(c.clics), ahora: c.clics, antes: m.catalogoAnterior.clics, color: "#2993ab" },
    { titulo: "CTR", valor: pct(ahora.ctr), ahora: ahora.ctr, antes: antes.ctr, color: "#318dc8" },
    { titulo: "Añadidos al carrito", valor: formatNumero(c.carritos), ahora: c.carritos, antes: m.catalogoAnterior.carritos, color: "#21988d" },
    { titulo: "Compras", valor: formatNumero(c.compras), ahora: c.compras, antes: m.catalogoAnterior.compras, color: "#199e70" },
    { titulo: "Conversión", valor: pct(ahora.conversion), ahora: ahora.conversion, antes: antes.conversion, color: "#3fb68b" },
  ];

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
          <p className="text-xs text-ink-400">
            Semana del {fecha(m.semana.desde)} al {fecha(m.semana.hasta)}
          </p>
        </div>
      </div>

      {DATOS_DE_EJEMPLO && (
        <p className="rounded-xl border border-warning/25 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          <strong>Datos de ejemplo</strong> hasta que Amazon apruebe el permiso de Brand Analytics.
        </p>
      )}

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
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${activo ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
            >
              {k && <Bandera codigo={k.codigoPais} />}
              {k?.pais ?? x.marketplaceId}
            </Link>
          );
        })}
      </nav>

      {/* Listing in search, like the dashboard's period tiles */}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cifras.map((x) => (
          <li key={x.titulo} className="overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
            <p className="px-3 py-1.5 text-xs font-semibold text-white" style={{ background: x.color }}>
              {x.titulo}
            </p>
            <div className="px-3 py-2.5">
              <p className="tabular text-xl font-semibold text-ink-100">{x.valor}</p>
              <p className="text-[11px] text-ink-400">
                <Variacion ahora={x.ahora} antes={x.antes} /> vs semana anterior
              </p>
            </div>
          </li>
        ))}
      </ul>

      {/* Search queries */}
      <Tarjeta titulo={`Búsquedas que te traen clientes en ${info?.pais ?? ""}`} derecha={<span className="text-xs text-white/80">{m.consultas.length} búsquedas</span>}>
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[860px] text-sm">
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
              {m.consultas.map((q) => {
                const imp = cuota(q.tuyo.impresiones, q.total.impresiones);
                const conv = cuota(q.tuyo.compras, q.tuyo.clics);
                const convMedia = cuota(q.total.compras, q.total.clics);
                return (
                  <tr key={q.busqueda}>
                    <td className="py-2.5 pr-3 pl-4 text-ink-100">{q.busqueda}</td>
                    <td className="px-3 py-2.5 text-right text-ink-300">{formatNumero(q.volumen)}</td>
                    <td className="px-3 py-2.5 text-ink-100">
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
                      <span className={conv >= convMedia ? "text-success" : "text-danger"}>{pct(conv)}</span>
                      <span className="text-ink-500"> / {pct(convMedia)}</span>
                    </td>
                    <td className="py-2.5 pr-4 pl-3 text-right">
                      <span className="text-ink-100">{formatMoneda(q.tuPrecio, m.moneda)}</span>
                      <span className="text-ink-500"> / {formatMoneda(q.precioMediano, m.moneda)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[11px] leading-snug text-ink-500">
          Tu % de impresiones es la mejor pista de tu posición: si baja de una semana a otra, estás cayendo en esa búsqueda. Conversión en verde: conviertes mejor que la media de esa búsqueda.
        </p>
      </Tarjeta>

      {/* Who leads the main query */}
      <Tarjeta
        titulo={`Quién domina «${dominio.busqueda}»`}
        color="#e0a526"
        derecha={
          <span className="text-xs text-white/90">
            Vas 1º en {ganadas} de {m.competidores.length} búsquedas
          </span>
        }
      >
        {/* One chip per main query, with your place in it: green when you lead, red when you're out of the top 3. */}
        <nav aria-label="Búsqueda" className="flex flex-wrap gap-1.5 border-b border-white/[0.06] px-4 py-3">
          {m.competidores.map((c, i) => {
            const p = posicion(i);
            const activa = i === qElegida;
            const color = p === 1 ? "bg-success text-ink-950" : p ? "bg-warning text-ink-950" : "bg-danger text-white";
            return (
              <Link
                key={c.busqueda}
                href={`/palabras-clave/${asin}?mk=${m.marketplaceId}&q=${i}`}
                scroll={false}
                aria-current={activa ? "true" : undefined}
                className={`inline-flex h-8 items-center gap-2 rounded-lg border pr-2.5 pl-1 text-xs transition-colors ${activa ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
              >
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${color}`}>{p ? `${p}º` : "fuera"}</span>
                {c.busqueda}
              </Link>
            );
          })}
        </nav>
        <ul className="divide-y divide-white/[0.05]">
          {dominio.productos.map((p, i) => (
            <li key={p.asin} className={`flex items-center gap-3 px-4 py-2.5 ${p.esTuyo ? "bg-success/[0.07]" : ""}`}>
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${p.esTuyo ? "bg-success text-ink-950" : "bg-white/[0.08] text-ink-300"}`}>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm ${p.esTuyo ? "font-semibold text-success" : "text-ink-100"}`}>{p.titulo}</span>
                <span className="block font-mono text-[11px] text-ink-500">{p.asin}</span>
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
        </ul>
        {!dominio.productos.some((p) => p.esTuyo) && <p className="bg-danger/10 px-4 py-2.5 text-xs text-danger">Tu listing no está entre los 3 más clicados en esta búsqueda.</p>}
        <p className="border-t border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[11px] text-ink-500">
          Los 3 productos más clicados en cada búsqueda, con sus clics y ventas de la semana (y su % del total). Verde: vas 1º · amarillo: 2º o 3º · rojo: fuera del top 3.
        </p>
      </Tarjeta>

      {/* Niche searches not bringing clients yet (Search Terms) */}
      <Tarjeta titulo={`Búsquedas de tu nicho que aún no aprovechas en ${info?.pais ?? ""}`} color="#8b7cf6" derecha={<span className="text-xs text-white/90">{m.oportunidades.length} búsquedas</span>}>
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
              {m.oportunidades.map((o) => {
                const sube = o.ranking < o.rankingAnterior;
                return (
                  <tr key={o.busqueda}>
                    <td className="py-2.5 pr-3 pl-4 text-ink-100">{o.busqueda}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="text-ink-100">nº {formatNumero(o.ranking)}</span>
                      <span className={`ml-1.5 text-[11px] ${sube ? "text-success" : "text-danger"}`}>{sube ? "▲ sube" : "▼ baja"}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-300">
                      {o.top.map((t, i) => (
                        <span key={t.asin} className={`block truncate ${t.asin === asin ? "font-semibold text-success" : ""}`}>
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
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[11px] leading-snug text-ink-500">
          Búsquedas populares de tu nicho (de todo Amazon) que todavía no te traen clientes. Popularidad: nº 1 = la búsqueda más hecha del país esa semana. Ideas: añadir estas palabras al título,
          bullets o términos ocultos del listing, o hacer publicidad en ellas.
        </p>
      </Tarjeta>

      {/* Products bought in the same order */}
      <Tarjeta titulo={`Cesta de la compra en ${info?.pais ?? ""}`} color="#3fb68b" derecha={<span className="text-xs text-white/90">Market Basket Analysis</span>}>
        <ul className="divide-y divide-white/[0.05]">
          {m.cesta.map((p, i) => (
            <li key={p.asin} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-bold text-ink-300">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink-100">{p.titulo}</span>
                <span className="block font-mono text-[11px] text-ink-500">{p.asin}</span>
              </span>
              <span className="w-44 text-xs text-ink-400">
                <span className="block">
                  <span className="font-semibold text-ink-100">≈ {formatNumero(Math.max(1, Math.round(p.porcentaje * c.compras)))}</span> de tus {formatNumero(c.compras)} pedidos
                </span>
                <Barra valor={p.porcentaje} color="#3fb68b" />
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[11px] leading-snug text-ink-500">
          Los 3 productos que más se compran en el mismo pedido que tu listing esta semana, con el % de tus pedidos que los incluyen. Ideas: un pack con ellos, un producto nuevo para tu marca o anuncios
          en sus fichas, donde está tu cliente.
        </p>
      </Tarjeta>
    </div>
  );
}
