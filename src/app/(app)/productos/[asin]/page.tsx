import Link from "next/link";
import { notFound } from "next/navigation";
import { detalleProducto } from "@/lib/datos/productos";
import { ETIQUETAS_POR_ASIN } from "@/lib/datos/etiquetas";
import { formatEuros, formatMoneda, formatNumero } from "@/lib/format";
import { Bandera } from "@/components/Bandera";
import { Galeria } from "@/components/productos/Galeria";
import { ActualizarFicha } from "@/components/productos/ActualizarFicha";
import { CosteRegiones } from "@/components/productos/CosteRegiones";
import { costeTotal, MARKETPLACE_UK, obtenerEscandallo, regionDeMarketplace } from "@/lib/datos/escandallos";
import { tarifasDeSkus } from "@/lib/datos/tarifasVenta";
import { PagoAmazon } from "@/components/productos/PagoAmazon";
import { eurPorUnidad } from "@/lib/amazon/tiposCambio";
import { contactosDe } from "@/lib/datos/proveedores";
import { ProveedoresProducto } from "@/components/productos/ProveedoresProducto";

const ES = "A1RKKUPIHCS9HS";

/** Amazon-style price: big whole part, small raised decimals, currency where the locale puts it. */
function PrecioAmazon({ valor, moneda }: { valor: number; moneda: string }) {
  const partes = new Intl.NumberFormat("es-ES", { style: "currency", currency: moneda, currencyDisplay: "narrowSymbol" }).formatToParts(valor);
  const simbolo = partes.find((p) => p.type === "currency")?.value ?? "";
  const antes = partes.findIndex((p) => p.type === "currency") < partes.findIndex((p) => p.type === "integer");
  const entero = partes.filter((p) => p.type === "integer" || p.type === "group").map((p) => p.value).join("");
  const decimales = partes.find((p) => p.type === "fraction")?.value ?? "00";
  return (
    <span className="inline-flex items-start leading-none text-[#0F1111]" aria-label={formatMoneda(valor, moneda)}>
      {antes && <span className="mt-[3px] text-[13px]">{simbolo}</span>}
      <span className="text-[28px] font-normal">{entero}</span>
      <span className="mt-[3px] text-[13px]">{decimales}</span>
      {!antes && <span className="mt-[3px] ml-0.5 text-[13px]">{simbolo}</span>}
    </span>
  );
}

export default async function ProductoPage({ params, searchParams }: PageProps<"/productos/[asin]">) {
  const { asin } = await params;
  const sp = await searchParams;
  if (!/^[A-Z0-9]{10}$/.test(asin)) notFound();
  const [d, costeEU, costeUK] = await Promise.all([detalleProducto(asin), obtenerEscandallo(asin, "eu"), obtenerEscandallo(asin, "uk")]);
  // Suppliers of both regions, once each.
  const contactos = await contactosDe([...new Set([...costeEU.proveedores, ...costeUK.proveedores].map((p) => p.nombre).filter(Boolean))]);
  const f = d.ficha;
  // The UK cost is compared with the amazon.co.uk price converted to euros (ECB rate); no rate → no share shown.
  const precioUK = f?.precios[MARKETPLACE_UK];
  const eurPorGBP = precioUK?.precio != null ? await eurPorUnidad(precioUK.moneda, new Date()).catch(() => null) : null;
  const tarifas = await tarifasDeSkus(d.skus);
  const mks = new Map(d.marketplaces.map((m) => [m.id, m]));

  // Marketplaces with something to show for this ASIN; amazon.es first.
  const disponibles = [...new Set([...Object.keys(f?.mercados ?? {}), ...Object.keys(f?.precios ?? {})])]
    .filter((id) => mks.has(id))
    .sort((a, b) => (a === ES ? -1 : b === ES ? 1 : mks.get(a)!.pais.localeCompare(mks.get(b)!.pais, "es")));
  const pedido = typeof sp.mk === "string" ? sp.mk : undefined;
  const mkId = pedido && disponibles.includes(pedido) ? pedido : (disponibles[0] ?? ES);
  const mk = mks.get(mkId);
  const ficha = f?.mercados[mkId];
  const precio = f?.precios[mkId];
  const titulo = ficha?.titulo ?? d.tituloRespaldo ?? asin;
  const imagenes = ficha?.imagenes.length ? ficha.imagenes : d.imagenRespaldo ? [d.imagenRespaldo] : [];
  if (!f && d.skus.length === 0) notFound();

  const v = d.ventas[mkId];
  const vTodos = d.ventas["*"];
  const etiqueta = ETIQUETAS_POR_ASIN[asin];
  // Payout box: real fees of the latest sale in the selected country, against that region's unit cost.
  const muestra = tarifas[mkId] ?? null;
  const region = regionDeMarketplace(mkId);
  const eurMuestra = !muestra || muestra.moneda === "EUR" ? 1 : await eurPorUnidad(muestra.moneda, new Date()).catch(() => null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/productos" className="text-sm text-ink-400 hover:text-ink-100">
          ← Productos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          {mk?.dominio && (
            <a href={`https://${mk.dominio.replace(/^https?:\/\//, "")}/dp/${asin}`} target="_blank" rel="noopener noreferrer" className="text-sm text-ink-400 underline-offset-4 hover:text-ink-100 hover:underline">
              Ver en {mk.dominio.replace(/^(https?:\/\/)?www\./, "")} ↗
            </a>
          )}
          <ActualizarFicha asin={asin} />
        </div>
      </div>

      {/* Marketplace selector */}
      {disponibles.length > 0 && (
        <nav aria-label="País" className="flex flex-wrap gap-1.5">
          {disponibles.map((id) => {
            const m = mks.get(id)!;
            const activo = id === mkId;
            return (
              <Link
                key={id}
                href={`/productos/${asin}?mk=${id}`}
                scroll={false}
                aria-current={activo ? "page" : undefined}
                className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${activo ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:border-white/[0.16] hover:text-ink-100"}`}
              >
                <Bandera codigo={m.codigoPais} className="text-base" />
                {m.pais}
                {f?.precios[id] ? null : <span className="text-[10px] text-ink-600">sin oferta</span>}
              </Link>
            );
          })}
        </nav>
      )}

      {/* Seller strip: our own numbers, which a buyer doesn't see */}
      <section className="grid gap-3 rounded-2xl border border-white/[0.06] bg-ink-900/70 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs text-ink-400">SKU{d.skus.length > 1 ? "s" : ""}</p>
          <p className="mt-0.5 font-mono text-sm text-ink-100">{d.skus.join(", ") || "—"}</p>
          {etiqueta && <span className="mt-1 inline-block rounded bg-success/10 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-success">{etiqueta}</span>}
        </div>
        <div>
          <p className="text-xs text-ink-400">Stock FBA vendible</p>
          <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
            {d.regiones.length === 0 && <span className="text-sm text-ink-400">—</span>}
            {d.regiones.map((r) => (
              <span key={r.id} className="tabular inline-flex items-center gap-1.5 text-base font-semibold text-ink-100" title={r.paises.join(", ")}>
                {r.bandera && <span aria-hidden className={`fi fi-${r.bandera} rounded-[2px] text-sm`} />}
                {formatNumero(d.stockPorRegion[r.id]?.vendible ?? 0)}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-ink-400">Últimos 30 días {mk ? `· ${mk.pais}` : ""}</p>
          <p className="tabular mt-0.5 text-base font-semibold text-ink-100">
            {formatNumero(v?.unidades ?? 0)} uds · {formatEuros(v?.ventas ?? 0)}
          </p>
          <p className="tabular text-xs text-ink-400">
            Todos los países: {formatNumero(vTodos?.unidades ?? 0)} uds · {formatEuros(vTodos?.ventas ?? 0)} · {formatNumero(d.reembolsos30["*"] ?? 0)} reembolsos
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-400">Buy Box {mk ? `· ${mk.pais}` : ""}</p>
          {precio?.buyBox ? (
            <p className={`mt-0.5 text-base font-semibold ${precio.buyBox.nuestra ? "text-success" : "text-danger"}`}>
              {precio.buyBox.nuestra ? "✓ Es tuya" : `✗ La tiene otro vendedor (${formatMoneda(precio.buyBox.precio, precio.moneda)})`}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-ink-400">{precio ? "Sin Buy Box ahora mismo" : "Sin oferta en este país"}</p>
          )}
          {precio?.ofertas != null && <p className="text-xs text-ink-400">{precio.ofertas === 1 ? "1 oferta (solo la tuya)" : `${precio.ofertas} ofertas`}</p>}
        </div>
      </section>

      {/* Buyer's view: as the product page looks on Amazon */}
      <article className="rounded-2xl bg-white p-5 font-[Arial,sans-serif] text-[#0F1111] sm:p-6">
        <p className="mb-4 text-[11px] tracking-wide text-[#565959] uppercase">Vista del comprador {mk ? `· ${mk.dominio.replace(/^(https?:\/\/)?www\./, "")}` : ""}</p>
        {/* Compact gallery so the cost tiles below stay close. */}
        <div className="grid gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
          <Galeria imagenes={imagenes} titulo={titulo} />

          <div className="min-w-0">
            {ficha?.marca && <p className="text-sm text-[#007185]">Marca: {ficha.marca}</p>}
            <h1 className="mt-1 text-2xl leading-8 font-normal">{titulo}</h1>
            {/* The SP-API gives no star rating or review count: link to the listing's reviews page on that marketplace. */}
            {mk?.dominio && (
              <a
                href={`https://${mk.dominio.replace(/^https?:\/\//, "")}/product-reviews/${asin}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 text-sm text-[#007185] hover:text-[#C7511F] hover:underline"
              >
                {/* A neutral icon: filled stars would suggest a rating we don't actually have. */}
                <span className="text-[#DE7921]" aria-hidden>
                  ☆
                </span>
                Ver valoraciones de clientes ↗
              </a>
            )}
            <hr className="my-3 border-[#D5D9D9]" />

            {precio?.precio != null ? (
              <div>
                <PrecioAmazon valor={precio.precio} moneda={precio.moneda} />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  {precio.fba && (
                    <span className="inline-flex items-center rounded-sm bg-[#00A8E1] px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white italic">✓prime</span>
                  )}
                  {precio.envio === 0 ? <span>Envío <strong>GRATIS</strong></span> : precio.envio ? <span>+ {formatMoneda(precio.envio, precio.moneda)} de envío</span> : null}
                </div>
                {precio.fba && <p className="mt-2 text-sm text-[#565959]">Enviado por Amazon</p>}
              </div>
            ) : (
              <p className="text-lg text-[#B12704]">Actualmente no disponible en este país.</p>
            )}

            {ficha?.ranking && ficha.ranking.length > 0 && (
              <p className="mt-3 text-sm">
                {ficha.ranking.map((r, i) => (
                  <span key={i} className="block">
                    Nº {formatNumero(r.posicion)} en{" "}
                    {r.enlace ? (
                      <a href={r.enlace} target="_blank" rel="noopener noreferrer" className="text-[#007185] hover:text-[#C7511F] hover:underline">
                        {r.titulo}
                      </a>
                    ) : (
                      r.titulo
                    )}
                  </span>
                ))}
              </p>
            )}

          </div>
        </div>

        {!ficha && <p className="mt-6 text-sm text-[#565959]">Aún no hay ficha de catálogo para este país. Pulsa «Actualizar ficha».</p>}
      </article>

      {/* Our own cost of one unit, piece by piece (seller-only, so outside the buyer view). EU and UK apart. */}
      <CosteRegiones
        key={`${asin}-${regionDeMarketplace(mkId)}`}
        inicial={regionDeMarketplace(mkId)}
        regiones={{
          eu: { escandallo: costeEU, precioVenta: f?.precios[ES]?.precio ?? null },
          uk: {
            escandallo: costeUK,
            precioVenta: precioUK?.precio != null && eurPorGBP ? Math.round(precioUK.precio * eurPorGBP * 100) / 100 : null,
            precioOriginal: precioUK?.precio != null ? formatMoneda(precioUK.precio, precioUK.moneda) : undefined,
          },
        }}
      />

      <PagoAmazon
        key={`pago-${asin}-${mkId}`}
        muestra={muestra}
        pais={mk?.pais ?? "este país"}
        precioActual={precio?.precio ?? null}
        coste={costeTotal(region === "uk" ? costeUK : costeEU)}
        nombreCoste={region === "uk" ? "Reino Unido" : "Europa"}
        eurPorUnidad={eurMuestra}
      />

      {/* One contact card per supplier of the cost breakdown (keyed so a rename/refresh starts fresh). */}
      <ProveedoresProducto key={contactos.map((c) => c.id).join("|")} contactos={contactos} />
    </div>
  );
}
