"use client";

import { useState } from "react";
import type { TarifaVenta } from "@/lib/amazon/finanzas";
import { formatDiaLargo, formatEuros, formatMoneda, formatPorcentaje } from "@/lib/format";

type Props = {
  /** Latest clean real sale of this product in this country (per unit), or null if there's none yet. */
  muestra: TarifaVenta | null;
  pais: string;
  /** Current listing price there (VAT included), in the marketplace's currency. */
  precioActual: number | null;
  /** Product unit cost (EU or UK breakdown), in euros. */
  coste: number;
  nombreCoste: string;
  /** EUR per unit of the sale's currency (1 for euros); null if the rate couldn't be fetched. */
  eurPorUnidad: number | null;
};

/** "31,99" or "31.99" → 31.99 (NaN if not a number). */
const aNumero = (t: string) => (t.trim() === "" ? NaN : Number(t.replace(",", ".")));
const aTexto = (n: number) => n.toFixed(2).replace(".", ",");
/** Under roughly this price Amazon may apply its lower low-price FBA fee: the real fee would differ. */
const UMBRAL_BAJO_PRECIO = 12;

/**
 * Amazon's payout for one unit at a given price, from the fees of a real sale in that country:
 * referral fee and VAT scale with the price, the digital services fee with the referral fee,
 * and the FBA fee stays fixed (it depends on size and weight, not price).
 */
function calcular(m: TarifaVenta, precio: number) {
  const f = precio / m.precio;
  const iva = m.iva * f;
  const ivaRetenido = m.ivaRetenido * f;
  const comision = m.comision * f;
  const serviciosDigitales = m.comision > 0 ? comision * (m.serviciosDigitales / m.comision) : m.serviciosDigitales;
  const ingreso = precio - ivaRetenido - comision - serviciosDigitales - m.fba - m.otras;
  // VAT Amazon didn't keep is the seller's to declare: it isn't profit.
  const ivaTuyo = Math.max(0, iva - ivaRetenido);
  return { iva, ivaRetenido, comision, serviciosDigitales, ingreso, ivaTuyo, neto: ingreso - ivaTuyo };
}

export function PagoAmazon({ muestra, pais, precioActual, coste, nombreCoste, eurPorUnidad }: Props) {
  const inicial = precioActual ?? muestra?.precio ?? 0;
  const [texto, setTexto] = useState(aTexto(inicial));

  if (!muestra) {
    return (
      <section className="rounded-2xl border border-white/[0.06] bg-ink-900/70 p-4">
        <h2 className="text-lg font-semibold tracking-tight text-ink-100">Lo que te paga Amazon</h2>
        <p className="mt-1 text-sm text-ink-400">Aún no hay ventas en {pais} de las que sacar las tarifas reales. Aparecerá tras la primera venta sincronizada.</p>
      </section>
    );
  }

  const m = muestra;
  const precio = aNumero(texto);
  const valido = Number.isFinite(precio) && precio > 0 && precio < 100_000;
  const r = valido ? calcular(m, precio) : null;
  const moneda = (v: number) => formatMoneda(Math.round(v * 100) / 100, m.moneda);
  const enEuros = m.moneda === "EUR";
  const rate = enEuros ? 1 : eurPorUnidad;
  const netoEur = r && rate ? r.neto * rate : null;
  const beneficio = netoEur !== null ? netoEur - coste : null;
  const precioEur = valido && rate ? precio * rate : null;
  const margen = beneficio !== null && precioEur ? (beneficio / precioEur) * 100 : null;
  const rentabilidad = beneficio !== null && coste > 0 ? (beneficio / coste) * 100 : null;

  const tipoIva = m.precio - m.iva > 0 ? (m.iva / (m.precio - m.iva)) * 100 : 0;
  const tasaComision = (m.comision / m.precio) * 100;
  const esActual = precioActual !== null && valido && Math.abs(precio - precioActual) < 0.005;
  const esMuestra = valido && Math.abs(precio - m.precio) < 0.005;

  const linea = (etiqueta: string, valor: number, detalle?: string) =>
    valor > 0.004 ? (
      <div key={etiqueta} className="flex justify-between gap-3 py-1">
        <dt className="text-ink-400">
          {etiqueta}
          {detalle && <span className="ml-1.5 text-xs text-ink-600">{detalle}</span>}
        </dt>
        <dd className="tabular text-ink-300">− {moneda(valor)}</dd>
      </div>
    ) : null;

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-semibold tracking-tight text-ink-100">Lo que te paga Amazon</h2>
        <p className="text-xs text-ink-400">
          Por una unidad vendida en {pais}. Tarifas reales de tu venta del {formatDiaLargo(m.fecha.slice(0, 10))} a {moneda(m.precio)}
          {esMuestra ? "." : "; a otro precio se recalculan con esas mismas tarifas."}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Payout breakdown */}
        <article className="overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
          <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-white" style={{ background: "#2c90b6" }}>
            <p className="text-[15px] leading-tight font-semibold">Precio de venta</p>
            <div className="flex items-center gap-2">
              {!esActual && precioActual !== null && (
                <button onClick={() => setTexto(aTexto(precioActual))} className="text-xs text-white/80 underline-offset-2 hover:text-white hover:underline">
                  Precio actual
                </button>
              )}
              <label className="relative">
                <span className="sr-only">Precio de venta con IVA</span>
                <input
                  inputMode="decimal"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  aria-invalid={!valido}
                  className="tabular h-8 w-28 rounded-md border border-white/30 bg-white/15 pr-6 pl-2 text-right text-sm font-semibold text-white outline-none focus:border-white aria-[invalid=true]:border-danger"
                />
                <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-white/80">{formatMoneda(0, m.moneda).replace(/[\d,.\s]/g, "")}</span>
              </label>
            </div>
          </header>
          <div className="px-4 pt-2 pb-4 text-sm">
            {!r ? (
              <p className="py-3 text-warning">Escribe un precio válido.</p>
            ) : (
              <dl>
                <div className="flex justify-between gap-3 py-1">
                  <dt className="text-ink-400">Paga el cliente (IVA incluido)</dt>
                  <dd className="tabular text-ink-100">{moneda(precio)}</dd>
                </div>
                {linea("IVA retenido por Amazon", r.ivaRetenido, formatPorcentaje(tipoIva))}
                {linea("Comisión por venta", r.comision, formatPorcentaje(tasaComision))}
                {linea("Tarifa logística FBA", m.fba)}
                {linea("Servicios digitales", r.serviciosDigitales)}
                {linea("Otras tarifas", m.otras)}
                <div className="mt-1 flex justify-between gap-3 border-t border-white/[0.06] pt-2">
                  <dt className="font-medium text-ink-100">Te ingresa Amazon</dt>
                  <dd className="tabular font-semibold text-ink-100">{moneda(r.ingreso)}</dd>
                </div>
                {r.ivaTuyo > 0.004 && (
                  <>
                    {linea("IVA que declaras tú", r.ivaTuyo, formatPorcentaje(tipoIva))}
                    <div className="flex justify-between gap-3 py-1">
                      <dt className="text-ink-400">Neto sin IVA</dt>
                      <dd className="tabular text-ink-100">{moneda(r.neto)}</dd>
                    </div>
                  </>
                )}
                <p className="pt-2 text-[11px] leading-snug text-ink-600">
                  Tarifas tal como las cobra Amazon (con el IVA de las tarifas incluido). No incluye almacenamiento, publicidad ni suscripción.
                </p>
                {precio < UMBRAL_BAJO_PRECIO && (
                  <p className="pt-1 text-[11px] leading-snug text-warning">Por debajo de unos {UMBRAL_BAJO_PRECIO} la tarifa FBA puede ser la de bajo precio: el importe real sería algo distinto.</p>
                )}
              </dl>
            )}
          </div>
        </article>

        {/* Profit per unit */}
        <article className="flex flex-col overflow-hidden rounded-xl border border-accent-500/40 bg-ink-900/80 shadow-soft">
          <header className="px-4 py-2.5 text-ink-950" style={{ background: "#e0a526" }}>
            <p className="text-[15px] leading-tight font-semibold">Beneficio por unidad</p>
          </header>
          <div className="flex flex-1 flex-col px-4 pt-3 pb-4 text-sm">
            {beneficio === null || !r ? (
              <p className="text-ink-400">{r ? "No se pudo obtener el tipo de cambio." : "—"}</p>
            ) : (
              <>
                <p className={`tabular text-3xl font-semibold tracking-tight ${beneficio >= 0 ? "text-success" : "text-danger"}`}>{formatEuros(beneficio)}</p>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                  <p>
                    <span className="tabular text-lg font-semibold text-ink-100">{formatPorcentaje(margen)}</span>
                    <span className="ml-1.5 text-xs text-ink-400">margen sobre el precio</span>
                  </p>
                  <p>
                    <span className="tabular text-lg font-semibold text-ink-100">{formatPorcentaje(rentabilidad)}</span>
                    <span className="ml-1.5 text-xs text-ink-400">rentabilidad sobre el coste</span>
                  </p>
                </div>
                <dl className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-400">{r.ivaTuyo > 0.004 ? "Neto sin IVA" : "Te ingresa Amazon"}</dt>
                    <dd className="tabular text-ink-300">
                      {enEuros ? formatEuros(netoEur) : `${moneda(r.neto)} ≈ ${formatEuros(netoEur)}`}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-400">Coste del producto ({nombreCoste})</dt>
                    <dd className="tabular text-ink-300">− {formatEuros(coste)}</dd>
                  </div>
                </dl>
                <p className="mt-auto pt-3 text-[11px] leading-snug text-ink-600">
                  Coste de la sección «Coste del producto». Antes de publicidad y almacenamiento.
                  {!enEuros && " Libras pasadas a euros con el cambio del BCE de hoy."}
                </p>
              </>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
