"use client";

import { useEffect, useState } from "react";
import { Bandera } from "@/components/Bandera";
import { formatMoneda, formatNumero } from "@/lib/format";
import { PAISES_H10, type CodigoPais } from "@/lib/datos/h10Tipos";
import type { AjustesCalc, OfertaCalc, ProductoCalc } from "@/lib/datos/calculadora";
import type { TarifasDetalle } from "@/lib/amazon/apis";

const TIENDAS: Record<CodigoPais, { nombre: string; dominio: string; moneda: "EUR" | "GBP"; iva: number }> = {
  ES: { nombre: "España", dominio: "amazon.es", moneda: "EUR", iva: 21 },
  DE: { nombre: "Alemania", dominio: "amazon.de", moneda: "EUR", iva: 19 },
  FR: { nombre: "Francia", dominio: "amazon.fr", moneda: "EUR", iva: 20 },
  IT: { nombre: "Italia", dominio: "amazon.it", moneda: "EUR", iva: 22 },
  GB: { nombre: "Reino Unido", dominio: "amazon.co.uk", moneda: "GBP", iva: 20 },
};

/** «49,99» or «49.99» → 49.99; empty or not a number → null. */
const num = (s: string) => {
  const v = Number(s.replace(",", ".").trim());
  return s.trim() === "" || !Number.isFinite(v) ? null : v;
};
const pequena = (url: string) => url.replace(/^(https:\/\/m\.media-amazon\.com\/images\/I\/[^.]+)(\.[a-z]+)$/i, "$1._SL300_$2");
const cifra = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 2 });

function Campo({ etiqueta, valor, onChange, sufijo, ayuda }: { etiqueta: string; valor: string; onChange: (v: string) => void; sufijo?: string; ayuda?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-300" title={ayuda}>
        {etiqueta}
      </span>
      <span className="flex items-center gap-1.5">
        <input
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          className="tabular w-24 rounded-md border border-white/[0.12] bg-ink-950/60 px-2 py-1 text-right text-ink-100 outline-none focus:border-accent-400"
        />
        {sufijo && <span className="w-5 text-xs text-ink-500">{sufijo}</span>}
      </span>
    </label>
  );
}

function Linea({ etiqueta, valor, moneda, fuerte, sub }: { etiqueta: string; valor: number | null; moneda: string; fuerte?: boolean; sub?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 text-sm ${sub ? "pl-3 text-ink-400" : fuerte ? "font-semibold text-ink-100" : "text-ink-200"}`}>
      <span>{etiqueta}</span>
      <span className="tabular">{valor === null ? "—" : formatMoneda(valor, moneda)}</span>
    </div>
  );
}

/** The settings Amazon's fees API doesn't give: storage per m³ (each country and season) and the digital services %. */
function Ajustes({ ajustes, onGuardado, onCerrar }: { ajustes: AjustesCalc; onGuardado: (a: AjustesCalc) => void; onCerrar: () => void }) {
  const [borrador, setBorrador] = useState(() => ({
    almacenamiento: Object.fromEntries(PAISES_H10.map((p) => [p, { baja: String(ajustes.almacenamiento[p].baja), alta: String(ajustes.almacenamiento[p].alta) }])) as Record<CodigoPais, { baja: string; alta: string }>,
    serviciosDigitales: Object.fromEntries(PAISES_H10.map((p) => [p, String(ajustes.serviciosDigitales[p])])) as Record<CodigoPais, string>,
  }));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const cuerpo = {
      almacenamiento: Object.fromEntries(PAISES_H10.map((p) => [p, { baja: num(borrador.almacenamiento[p].baja), alta: num(borrador.almacenamiento[p].alta) }])),
      serviciosDigitales: Object.fromEntries(PAISES_H10.map((p) => [p, num(borrador.serviciosDigitales[p])])),
    };
    const r = await fetch("/api/calculadora/ajustes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { ajustes?: AjustesCalc; error?: string } | null;
    setGuardando(false);
    if (!r?.ok || !d?.ajustes) return setError(d?.error ?? "No se pudieron guardar");
    onGuardado(d.ajustes);
  };
  const entrada = "tabular w-20 rounded-md border border-white/[0.12] bg-ink-950/60 px-2 py-1 text-right text-ink-100 outline-none focus:border-accent-400";
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-ink-900/60 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-ink-100">Ajustes de la calculadora</h2>
        <button onClick={onCerrar} className="text-xs text-ink-400 hover:text-ink-200">
          Cerrar
        </button>
      </div>
      <p className="text-xs text-ink-400">
        Lo que la API de tarifas de Amazon no da. Almacenamiento: precio por m³ al mes (en la moneda del país). Servicios digitales: % que Amazon cobra sobre la comisión
        por referencia.
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-left text-[11px] tracking-wide text-ink-500 uppercase">
              <th className="py-1 pr-4 font-semibold">Tienda</th>
              <th className="py-1 pr-3 font-semibold">Ene–sep / m³</th>
              <th className="py-1 pr-3 font-semibold">Oct–dic / m³</th>
              <th className="py-1 font-semibold">Serv. digitales %</th>
            </tr>
          </thead>
          <tbody>
            {PAISES_H10.map((p) => (
              <tr key={p}>
                <td className="py-1 pr-4 text-ink-200">
                  <span className="inline-flex items-center gap-1.5">
                    <Bandera codigo={p} /> {TIENDAS[p].nombre}
                  </span>
                </td>
                {(["baja", "alta"] as const).map((t) => (
                  <td key={t} className="py-1 pr-3">
                    <input
                      value={borrador.almacenamiento[p][t]}
                      onChange={(e) => setBorrador({ ...borrador, almacenamiento: { ...borrador.almacenamiento, [p]: { ...borrador.almacenamiento[p], [t]: e.target.value } } })}
                      inputMode="decimal"
                      className={entrada}
                    />
                  </td>
                ))}
                <td className="py-1">
                  <input
                    value={borrador.serviciosDigitales[p]}
                    onChange={(e) => setBorrador({ ...borrador, serviciosDigitales: { ...borrador.serviciosDigitales, [p]: e.target.value } })}
                    inputMode="decimal"
                    className={entrada}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <button onClick={() => void guardar()} disabled={guardando} className="self-start rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-60">
        {guardando ? "Guardando…" : "Guardar ajustes"}
      </button>
    </div>
  );
}

/** Amazon's revenue calculator, rebuilt: a product of the catalog, its fees at a price, and what's left of each sale. */
export function VistaCalculadora({ ajustesIniciales, demo }: { ajustesIniciales: AjustesCalc; demo: boolean }) {
  const [ajustes, setAjustes] = useState(ajustesIniciales);
  const [verAjustes, setVerAjustes] = useState(false);
  const [pais, setPais] = useState<CodigoPais>("ES");
  const [q, setQ] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<ProductoCalc[] | null>(null);
  const [producto, setProducto] = useState<ProductoCalc | null>(null);
  const [oferta, setOferta] = useState<OfertaCalc | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The «Logística de Amazon» panel
  const [precio, setPrecio] = useState("");
  const [tarifas, setTarifas] = useState<TarifasDetalle | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [errorTarifas, setErrorTarifas] = useState<string | null>(null);
  const [temporada, setTemporada] = useState<"baja" | "alta">(() => (new Date().getMonth() >= 9 ? "alta" : "baja"));
  const [inventario, setInventario] = useState("1");
  const [ventas, setVentas] = useState("1");
  const [iva, setIva] = useState(String(TIENDAS.ES.iva));
  const [otros, setOtros] = useState("0");
  const [coste, setCoste] = useState("0");

  const tienda = TIENDAS[pais];
  const moneda = tienda.moneda;

  const buscar = async () => {
    if (q.trim().length < 2) return;
    setBuscando(true);
    setError(null);
    const r = await fetch(`/api/calculadora/buscar?pais=${pais}&q=${encodeURIComponent(q.trim())}`).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { productos?: ProductoCalc[]; error?: string } | null;
    setBuscando(false);
    if (!r?.ok || !d?.productos) return setError(d?.error ?? "No se pudo buscar");
    setResultados(d.productos);
    if (d.productos.length === 1) void elegir(d.productos[0]);
  };

  const elegir = async (p: ProductoCalc) => {
    setProducto(p);
    setOferta(null);
    setTarifas(null);
    setError(null);
    const r = await fetch(`/api/calculadora/oferta?pais=${pais}&asin=${p.asin}`).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { oferta?: OfertaCalc } | null;
    if (d?.oferta) {
      setOferta(d.oferta);
      if (d.oferta.precio !== null) setPrecio(String(d.oferta.precio).replace(".", ","));
    }
  };

  const cambiarPais = (p: CodigoPais) => {
    setPais(p);
    setIva(String(TIENDAS[p].iva));
    setResultados(null);
    setProducto(null);
    setOferta(null);
    setTarifas(null);
    setPrecio("");
  };

  // Amazon's fees at the price typed, asked again a moment after it changes.
  const precioNum = num(precio);
  useEffect(() => {
    if (!producto || !precioNum || precioNum <= 0) return;
    let vigente = true;
    const t = setTimeout(async () => {
      setCalculando(true);
      setErrorTarifas(null);
      const r = await fetch("/api/calculadora/tarifas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pais, asin: producto.asin, precio: precioNum }) }).catch(
        () => null,
      );
      const d = (await r?.json().catch(() => null)) as { tarifas?: TarifasDetalle; error?: string } | null;
      if (!vigente) return;
      setCalculando(false);
      if (!r?.ok || !d?.tarifas) {
        setTarifas(null);
        setErrorTarifas(d?.error ?? "No se pudieron calcular las tarifas");
      } else setTarifas(d.tarifas);
    }, 600);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [producto, precioNum, pais]);

  // The figures, unrounded until shown (as Amazon does).
  // + a hair so a half cent rounds up as Amazon does (7,50 × 3 % = 0,225 → 0,23; in binary it's 0,22499…).
  const dst = tarifas ? (tarifas.comision * ajustes.serviciosDigitales[pais]) / 100 + 1e-9 : null;
  const tarifasAmazon = tarifas && dst !== null ? tarifas.comision + tarifas.porArticulo + tarifas.variable + dst : null;
  const m3 = producto?.medidasCm ? (producto.medidasCm[0] * producto.medidasCm[1] * producto.medidasCm[2]) / 1_000_000 : null;
  const inv = num(inventario) ?? 0;
  const ventasNum = num(ventas) ?? 0;
  const almacenMes = m3 !== null ? m3 * ajustes.almacenamiento[pais][temporada] * inv : null;
  const almacenUnidad = almacenMes !== null && ventasNum > 0 ? almacenMes / ventasNum : null;
  const ivaImporte = precioNum ? precioNum - precioNum / (1 + (num(iva) ?? 0) / 100) : null;
  const otrosNum = num(otros) ?? 0;
  const costeNum = num(coste) ?? 0;
  const costeUnidad =
    tarifasAmazon !== null && tarifas && ivaImporte !== null ? tarifasAmazon + tarifas.logistica + (almacenUnidad ?? 0) + ivaImporte + otrosNum + costeNum : null;
  const beneficioUnidad = costeUnidad !== null && precioNum ? precioNum - costeUnidad : null;
  const margen = beneficioUnidad !== null && precioNum ? (beneficioUnidad / precioNum) * 100 : null;

  const caja = "rounded-xl border border-white/[0.08] bg-ink-900/60 p-4";
  return (
    <div className="flex flex-col gap-4">
      {verAjustes && (
        <Ajustes
          ajustes={ajustes}
          onCerrar={() => setVerAjustes(false)}
          onGuardado={(a) => {
            setAjustes(a);
            setVerAjustes(false);
          }}
        />
      )}

      {/* Search */}
      <div className={`${caja} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Buscar en el catálogo de Amazon</h2>
          <button onClick={() => setVerAjustes(!verAjustes)} className="text-xs text-ink-400 hover:text-ink-200" title="Almacenamiento por m³ y servicios digitales">
            ⚙ Ajustes
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PAISES_H10.map((p) => (
            <button
              key={p}
              onClick={() => cambiarPais(p)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm ${p === pais ? "border-accent-400 bg-accent-500/15 text-accent-200" : "border-white/[0.08] text-ink-300 hover:bg-white/[0.04]"}`}
            >
              <Bandera codigo={p} /> {TIENDAS[p].dominio}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void buscar();
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ASIN, EAN, UPC o título"
            disabled={demo}
            className="min-w-0 flex-1 rounded-lg border border-white/[0.12] bg-ink-950/60 px-3 py-2 text-sm text-ink-100 outline-none focus:border-accent-400"
          />
          <button type="submit" disabled={buscando || demo || q.trim().length < 2} className="rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-60">
            {buscando ? "Buscando…" : "Buscar"}
          </button>
        </form>
        {error && <p className="text-xs text-danger">{error}</p>}
        {resultados && resultados.length === 0 && <p className="text-sm text-ink-400">No hay productos con eso en {tienda.dominio}.</p>}
        {resultados && resultados.length > 1 && (
          <div className="flex flex-col gap-1">
            {resultados.map((r) => (
              <button
                key={r.asin}
                onClick={() => void elegir(r)}
                className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/[0.04] ${producto?.asin === r.asin ? "bg-white/[0.06]" : ""}`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded bg-white p-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.imagen && <img src={pequena(r.imagen)} alt="" loading="lazy" className="size-full object-contain" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-200">{r.titulo}</span>
                <span className="tabular shrink-0 text-xs text-ink-500">{r.asin}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {producto && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* The product */}
          <div className={`${caja} flex flex-col gap-3`}>
            <div className="flex gap-3">
              <a
                href={`https://www.${tienda.dominio}/dp/${producto.asin}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1"
                title="Ver en Amazon"
              >
                {producto.imagen ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pequena(producto.imagen)} alt="" className="size-full object-contain" />
                ) : (
                  <span className="text-[10px] text-ink-600">Sin foto</span>
                )}
              </a>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="line-clamp-3 text-sm font-medium text-ink-100">{producto.titulo}</p>
                <p className="text-xs text-ink-400">
                  ASIN <span className="tabular text-ink-200">{producto.asin}</span>
                  {producto.marca && <> · {producto.marca}</>}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-ink-400">Peso unitario</dt>
              <dd className="tabular text-ink-200">{producto.pesoKg !== null ? `${cifra(producto.pesoKg)} kg` : "—"}</dd>
              <dt className="text-ink-400">Dimensiones del paquete</dt>
              <dd className="tabular text-ink-200">
                {producto.medidasCm ? `${producto.medidasCm.map(cifra).join(" × ")} cm` : "—"}
                {m3 !== null && <span className="ml-1.5 text-xs text-ink-500">({m3.toLocaleString("es-ES", { maximumFractionDigits: 4 })} m³)</span>}
              </dd>
              <dt className="text-ink-400">Tienda</dt>
              <dd className="text-ink-200">
                <span className="inline-flex items-center gap-1.5">
                  <Bandera codigo={pais} /> {tienda.dominio}
                </span>
              </dd>
              <dt className="text-ink-400">Índice de ventas</dt>
              <dd className="text-ink-200">{producto.rank ? `#${formatNumero(producto.rank.posicion)} en ${producto.rank.categoria}` : "—"}</dd>
              <dt className="text-ink-400">Ofertas</dt>
              <dd className="tabular text-ink-200">{oferta?.ofertas ?? "—"}</dd>
              <dt className="text-ink-400">Precio + envío</dt>
              <dd className="tabular text-ink-200">{oferta ? formatMoneda(oferta.precio, oferta.moneda) : "…"}</dd>
              <dt className="text-ink-400">Expedido por</dt>
              <dd className="text-ink-200">{oferta?.envioAmazon === null || !oferta ? "—" : oferta.envioAmazon ? "Amazon" : "El vendedor"}</dd>
            </dl>
          </div>

          {/* Logística de Amazon */}
          <div className={`${caja} flex flex-col gap-3`}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-ink-100">Logística de Amazon</h2>
              {calculando && <span className="text-xs text-ink-500">Calculando…</span>}
            </div>
            <Campo etiqueta="Precio del artículo" valor={precio} onChange={setPrecio} sufijo={moneda === "GBP" ? "£" : "€"} />
            {errorTarifas && <p className="text-xs text-danger">{errorTarifas}</p>}

            <div className="flex flex-col gap-1 border-t border-white/[0.06] pt-3">
              <Linea etiqueta="Tarifas de Amazon" valor={tarifasAmazon} moneda={moneda} fuerte />
              <Linea etiqueta="Tarifa por referencia" valor={tarifas?.comision ?? null} moneda={moneda} sub />
              <Linea etiqueta="Tarifa por venta de artículo" valor={tarifas?.porArticulo ?? null} moneda={moneda} sub />
              <Linea etiqueta="Tarifa variable de cierre" valor={tarifas?.variable ?? null} moneda={moneda} sub />
              <Linea etiqueta={`Servicios digitales (${cifra(ajustes.serviciosDigitales[pais])} %)`} valor={dst} moneda={moneda} sub />
            </div>
            <div className="border-t border-white/[0.06] pt-3">
              <Linea etiqueta="Gestión logística" valor={tarifas?.logistica ?? null} moneda={moneda} fuerte />
            </div>

            <div className="flex flex-col gap-2 border-t border-white/[0.06] pt-3">
              <Linea etiqueta="Almacenamiento (por unidad vendida)" valor={almacenUnidad} moneda={moneda} fuerte />
              <div className="flex gap-1.5">
                {(
                  [
                    ["baja", "Enero – septiembre"],
                    ["alta", "Octubre – diciembre"],
                  ] as const
                ).map(([t, texto]) => (
                  <button
                    key={t}
                    onClick={() => setTemporada(t)}
                    className={`rounded-md border px-2.5 py-1 text-xs ${t === temporada ? "border-accent-400 bg-accent-500/15 text-accent-200" : "border-white/[0.08] text-ink-400 hover:bg-white/[0.04]"}`}
                  >
                    {texto}
                  </button>
                ))}
              </div>
              <Campo etiqueta="Promedio de unidades en inventario" valor={inventario} onChange={setInventario} />
              <Campo etiqueta="Estimación de ventas mensuales" valor={ventas} onChange={setVentas} />
              <p className="text-[11px] text-ink-500">
                {cifra(ajustes.almacenamiento[pais][temporada])} {moneda === "GBP" ? "£" : "€"}/m³ al mes (cámbialo en ⚙ Ajustes)
                {m3 === null && " · Amazon no da las medidas del paquete"}
              </p>
            </div>

            <div className="flex flex-col gap-2 border-t border-white/[0.06] pt-3">
              <div className="text-sm font-semibold text-ink-100">Otros costes</div>
              <Campo etiqueta="IVA" valor={iva} onChange={setIva} sufijo="%" />
              <div className="-mt-1 text-right text-xs text-ink-500">{ivaImporte !== null ? formatMoneda(ivaImporte, moneda) : "—"}</div>
              <Campo etiqueta="Otros costes (por unidad)" valor={otros} onChange={setOtros} sufijo={moneda === "GBP" ? "£" : "€"} ayuda="Envío a Amazon, publicidad…" />
              <Campo etiqueta="Coste del producto" valor={coste} onChange={setCoste} sufijo={moneda === "GBP" ? "£" : "€"} />
            </div>
          </div>
        </div>
      )}

      {producto && (
        <div className={`${caja} grid grid-cols-2 gap-4 sm:grid-cols-4`}>
          <div>
            <div className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Coste por unidad</div>
            <div className="tabular text-lg font-bold text-ink-100">{costeUnidad !== null ? formatMoneda(costeUnidad, moneda) : "—"}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Ventas en 30 días</div>
            <div className="tabular text-lg font-bold text-ink-100">{formatNumero(ventasNum)}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Beneficio neto</div>
            <div className={`tabular text-lg font-bold ${beneficioUnidad !== null && beneficioUnidad < 0 ? "text-danger" : "text-success"}`}>
              {beneficioUnidad !== null ? formatMoneda(beneficioUnidad, moneda) : "—"}
            </div>
            {beneficioUnidad !== null && ventasNum > 1 && <div className="tabular text-xs text-ink-400">{formatMoneda(beneficioUnidad * ventasNum, moneda)} al mes</div>}
          </div>
          <div>
            <div className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Margen neto</div>
            <div className={`tabular text-lg font-bold ${margen !== null && margen < 0 ? "text-danger" : "text-success"}`}>
              {margen !== null ? `${margen.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %` : "—"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
