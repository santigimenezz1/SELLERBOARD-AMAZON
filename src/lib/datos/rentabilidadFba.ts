import { MONEDA_TARIFA, PAISES_TARIFA, type CalculoTarifa, type PaisTarifa } from "./tarifasFba";

/*
 * What a box earns in each store at the sale price that leaves each margin: for 0 %, 10 %… 30 % of the price (with
 * VAT) left as profit, the price, every cost, the profit per unit and the ROAS the ads need not to lose money.
 */

export const MARGENES = [0, 0.1, 0.15, 0.2, 0.25, 0.3];
/** VAT of each store (%). */
export const IVA: Record<PaisTarifa, number> = { ES: 21, DE: 19, FR: 20, UK: 20 };
/** Digital services fee on the referral fee (%): Spain and France 3 %, the UK 2 %, Germany none. */
export const SERVICIOS_DIGITALES: Record<PaisTarifa, number> = { ES: 3, DE: 0, FR: 3, UK: 2 };
/** Amazon's minimum referral fee per unit (in each store's currency). */
const COMISION_MINIMA = 0.3;
/**
 * Monthly storage of a standard-size product (rate card from 1 February 2026): €/m³ in the EU; in the UK £0,76 and
 * £1,51 per ft³, in £/m³. Oversize: €21,78/34,49 per m³ (UK £0,55/0,87 per ft³).
 */
const ALMACEN = {
  estandar: { UE: { baja: 27.54, alta: 52.2 }, UK: { baja: 0.76 * 35.3147, alta: 1.51 * 35.3147 } },
  grande: { UE: { baja: 21.78, alta: 34.49 }, UK: { baja: 0.55 * 35.3147, alta: 0.87 * 35.3147 } },
};

export type SupuestosRentabilidad = {
  /** Product cost and shipping to Amazon per unit, in euros. */
  coste: number;
  envio: number;
  /** Referral fee (%). */
  comision: number;
  /** Months each unit spends stored at Amazon, on average. */
  meses: number;
  temporada: "baja" | "alta";
};

export type FilaRentabilidad = {
  margen: number;
  /** Sale price with VAT, and each cost per unit, in the store's currency. */
  precio: number;
  comision: number;
  servicios: number;
  logistica: number;
  almacen: number;
  iva: number;
  coste: number;
  envio: number;
  ganancia: number;
  /** Sales ÷ ad spend to break even when the whole profit goes to ads (null at 0 %: nothing to spend). */
  roas: number | null;
};

export type RentabilidadPais = { pais: PaisTarifa; moneda: "€" | "£"; filas: FilaRentabilidad[] };

/**
 * Each store's prices and profits at each margin. `eurPorGbp`: to pass the euro costs into pounds for the UK.
 * The price is solved from: price − referral − its digital services fee − VAT − the fixed costs = margin × price.
 */
export function rentabilidad(r: CalculoTarifa, s: SupuestosRentabilidad, eurPorGbp: number): RentabilidadPais[] {
  if (!r.categoria) return [];
  const m3 = r.volumen / 1_000_000;
  const tamano = r.categoria.porKg ? "grande" : "estandar";
  return PAISES_TARIFA.map((pais) => {
    const aLocal = pais === "UK" ? 1 / eurPorGbp : 1;
    const logistica = r.paises.find((p) => p.pais === pais)!.total;
    const almacen = m3 * ALMACEN[tamano][pais === "UK" ? "UK" : "UE"][s.temporada] * Math.max(0, s.meses);
    const coste = s.coste * aLocal;
    const envio = s.envio * aLocal;
    const fijos = logistica + almacen + coste + envio;
    const dst = SERVICIOS_DIGITALES[pais] / 100;
    const ivaParte = IVA[pais] / (100 + IVA[pais]);
    const filas = MARGENES.map((margen): FilaRentabilidad => {
      const pct = s.comision / 100;
      let precio = fijos / (1 - pct * (1 + dst) - ivaParte - margen);
      // Under the minimum, the referral fee is a fixed 0,30.
      if (pct * precio < COMISION_MINIMA) precio = (fijos + COMISION_MINIMA * (1 + dst)) / (1 - ivaParte - margen);
      const comision = Math.max(pct * precio, COMISION_MINIMA);
      const servicios = comision * dst;
      const iva = precio * ivaParte;
      const resto = precio - comision - servicios - iva - fijos;
      // 0 % comes out as a hair under zero (−0,00): it's nothing.
      const ganancia = Math.abs(resto) < 0.005 ? 0 : resto;
      return { margen, precio, comision, servicios, logistica, almacen, iva, coste, envio, ganancia, roas: margen > 0 ? precio / ganancia : null };
    });
    return { pais, moneda: MONEDA_TARIFA[pais], filas };
  });
}

/** What one unit leaves at a given sale price (with VAT) in a store: the same costs as `rentabilidad`, the other way round. */
export function aPrecio(r: CalculoTarifa, s: SupuestosRentabilidad, eurPorGbp: number, pais: PaisTarifa, precio: number) {
  if (!r.categoria || precio <= 0) return null;
  const m3 = r.volumen / 1_000_000;
  const tamano = r.categoria.porKg ? "grande" : "estandar";
  const aLocal = pais === "UK" ? 1 / eurPorGbp : 1;
  const logistica = r.paises.find((p) => p.pais === pais)!.total;
  const almacen = m3 * ALMACEN[tamano][pais === "UK" ? "UK" : "UE"][s.temporada] * Math.max(0, s.meses);
  const coste = s.coste * aLocal;
  const envio = s.envio * aLocal;
  const dst = SERVICIOS_DIGITALES[pais] / 100;
  const comision = Math.max((s.comision / 100) * precio, COMISION_MINIMA);
  const servicios = comision * dst;
  const iva = (precio * IVA[pais]) / (100 + IVA[pais]);
  const ganancia = precio - comision - servicios - iva - logistica - almacen - coste - envio;
  return { precio, comision, servicios, logistica, almacen, iva, coste, envio, ganancia, margen: ganancia / precio, roas: ganancia > 0 ? precio / ganancia : null };
}
