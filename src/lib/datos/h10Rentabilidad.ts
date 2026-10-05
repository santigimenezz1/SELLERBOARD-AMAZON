import { EUR_POR_GBP, rangosDePrecio } from "./h10Analisis";
import { SUPUESTOS_INICIALES, type CodigoPais, type EstudioH10, type MercadoXray, type PalabrasMercado, type SupuestosRentabilidad } from "./h10Tipos";

/*
 * What you'd make per unit selling the study's product in one country, and with a share of the market. Pure maths, all
 * in euros: Amazon's figures come from its revenue calculator when uploaded (else estimated, and said so), the rest
 * from the owner's own costs.
 */

const IVA: Record<CodigoPais, number> = { ES: 21, DE: 19, FR: 20, IT: 22, GB: 20 };
/** Referral fee of most sports and toy categories. */
const COMISION_HABITUAL = 0.15;
/** Fallbacks when nothing better is known. */
const FBA_POR_DEFECTO = 7;
const ALMACENAMIENTO_POR_DEFECTO = 0.5;
const PUJA_POR_DEFECTO = 0.8;
export const CUOTAS = [0.02, 0.05, 0.1];
/** Months of stock bought up front in the scenarios. */
const MESES_STOCK_INICIAL = 3;

const r2 = (v: number) => Math.round(v * 100) / 100;
const aEur = (v: number, moneda: string) => (moneda === "GBP" ? v * EUR_POR_GBP : v);
const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  return o.length ? (o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2) : null;
};

/** A figure and where it came from, shown next to it. */
export type Dato = { valor: number; fuente: string };

export type Desglose = {
  precio: number;
  iva: number;
  comision: number;
  tarifaFba: number;
  almacenamiento: number;
  publicidad: number;
  devoluciones: number;
  producto: number;
  beneficio: number;
};

export type RentabilidadPais = {
  codigoPais: CodigoPais;
  entradas: { precio: Dato; comisionPct: Dato; tarifaFba: Dato; almacenamientoMes: Dato; iva: Dato; pujaPpc: Dato };
  desglose: Desglose;
  margen: number;
  roi: number;
  /** Highest ACoS (ad spend over ad sales) before a sale loses money. */
  acosMaximo: number;
  /** Lowest price that still covers every cost. */
  precioMinimo: number;
  precios: { precio: number; beneficio: number; margen: number }[];
  /** Units the whole search sells a month (estimate from Xray). */
  unidadesMercado: number;
  escenarios: { cuota: number; unidades: number; beneficioMes: number; inversion: number; mesesRecuperar: number | null }[];
};

/** Profit per unit at a given price, with everything else fixed. */
function desgloseA(precio: number, e: { comisionPct: number; tarifaFba: number; almacenamientoMes: number; iva: number; pujaPpc: number }, s: SupuestosRentabilidad): Desglose {
  const iva = precio - precio / (1 + e.iva / 100);
  const comision = precio * e.comisionPct;
  const almacenamiento = e.almacenamientoMes * s.mesesStock;
  const publicidad = e.pujaPpc / (Math.max(s.conversion, 0.5) / 100);
  const producto = s.costeFabrica + s.envioUnidad;
  // A returned unit usually can't be sold again: its product, freight and fulfilment are lost.
  const devoluciones = (s.devoluciones / 100) * (producto + e.tarifaFba);
  const beneficio = precio - iva - comision - e.tarifaFba - almacenamiento - publicidad - devoluciones - producto;
  return { precio: r2(precio), iva: r2(iva), comision: r2(comision), tarifaFba: r2(e.tarifaFba), almacenamiento: r2(almacenamiento), publicidad: r2(publicidad), devoluciones: r2(devoluciones), producto: r2(producto), beneficio: r2(beneficio) };
}

/** Units a month of the whole search: the units column when the source has it, else revenue over average price. */
function unidadesDelMercado(m: MercadoXray): number {
  const conVentas = m.competidores.filter((c) => c.ventas !== null);
  if (conVentas.length >= m.competidores.length * 0.8 && conVentas.length) {
    // The visible rows only: scaled up to the whole search by revenue.
    const ventas = conVentas.reduce((s, c) => s + (c.ventas ?? 0), 0);
    const facturacionVisible = m.competidores.reduce((s, c) => s + c.facturacion, 0);
    return Math.round(facturacionVisible > 0 ? (ventas * m.facturacionTotal) / facturacionVisible : ventas);
  }
  return m.precioMedio > 0 ? Math.round(m.facturacionTotal / m.precioMedio) : 0;
}

export function rentabilidadPais(estudio: EstudioH10, m: MercadoXray, palabras: PalabrasMercado | undefined, supuestos?: SupuestosRentabilidad): RentabilidadPais {
  const s = supuestos ?? estudio.supuestos ?? SUPUESTOS_INICIALES;
  const calc = estudio.calculadoras?.[m.codigoPais];
  const otra = Object.values(estudio.calculadoras ?? {}).find((c) => c && c.codigoPais !== m.codigoPais);

  // Price: yours; else the calculator's; else the same as in a country that has one (it's the same product);
  // else the middle of the band that sells most; else the average.
  const banda = [...rangosDePrecio(m)].sort((a, b) => b.facturacionEur - a.facturacionEur)[0];
  const tuyo = s.precios?.[m.codigoPais];
  const precio: Dato = tuyo
    ? { valor: tuyo, fuente: "Tu precio" }
    : calc
    ? { valor: aEur(calc.precio, calc.moneda), fuente: "Calculadora de Amazon" }
    : otra
    ? { valor: aEur(otra.precio, otra.moneda), fuente: `Mismo precio que en ${otra.codigoPais} (calculadora)` }
    : banda
      ? { valor: banda.desde + 5, fuente: "Rango de precio que más vende (Xray)" }
      : { valor: aEur(m.precioMedio, m.moneda), fuente: "Precio medio (Xray)" };
  const comisionPct: Dato = calc && calc.precio > 0 ? { valor: calc.comision / calc.precio, fuente: "Calculadora de Amazon" } : { valor: COMISION_HABITUAL, fuente: "Habitual en la categoría" };
  const fbaXray = mediana(m.competidores.map((c) => c.tarifaFba).filter((v): v is number => !!v));
  const tarifaFba: Dato = calc
    ? { valor: aEur(calc.tarifaFba, calc.moneda), fuente: "Calculadora de Amazon" }
    : otra
      ? { valor: aEur(otra.tarifaFba, otra.moneda), fuente: `Calculadora de ${otra.codigoPais} (estimado)` }
      : fbaXray
        ? { valor: aEur(fbaXray, m.moneda), fuente: "Mediana de los competidores (Xray)" }
        : { valor: FBA_POR_DEFECTO, fuente: "Estimado" };
  const almacenamientoMes: Dato = calc
    ? { valor: aEur(calc.almacenamientoMes, calc.moneda), fuente: "Calculadora de Amazon (ene–sep)" }
    : otra
      ? { valor: aEur(otra.almacenamientoMes, otra.moneda), fuente: `Calculadora de ${otra.codigoPais} (estimado)` }
      : { valor: ALMACENAMIENTO_POR_DEFECTO, fuente: "Estimado" };
  const iva: Dato = calc?.iva ? { valor: calc.iva, fuente: "Calculadora de Amazon" } : { valor: IVA[m.codigoPais], fuente: "IVA del país" };
  // Bid of the most searched keyword.
  const principal = palabras?.palabras.filter((p) => p.pujaPpc > 0).sort((a, b) => b.busquedas - a.busquedas)[0];
  const pujaPpc: Dato = principal ? { valor: aEur(principal.pujaPpc, m.moneda), fuente: `Puja de «${principal.texto}» (Cerebro)` } : { valor: PUJA_POR_DEFECTO, fuente: "Estimado" };

  const e = { comisionPct: comisionPct.valor, tarifaFba: tarifaFba.valor, almacenamientoMes: almacenamientoMes.valor, iva: iva.valor, pujaPpc: pujaPpc.valor };
  const d = desgloseA(precio.valor, e, s);
  const fijos = d.tarifaFba + d.almacenamiento + d.publicidad + d.devoluciones + d.producto;
  const factor = 1 / (1 + e.iva / 100) - e.comisionPct;
  const unidadesMercado = unidadesDelMercado(m);
  const producto = s.costeFabrica + s.envioUnidad;

  return {
    codigoPais: m.codigoPais,
    entradas: { precio, comisionPct, tarifaFba, almacenamientoMes, iva, pujaPpc },
    desglose: d,
    margen: d.precio > 0 ? d.beneficio / d.precio : 0,
    roi: producto > 0 ? d.beneficio / producto : 0,
    acosMaximo: d.precio > 0 ? Math.max(0, (d.beneficio + d.publicidad) / d.precio) : 0,
    precioMinimo: factor > 0 ? r2(fijos / factor) : 0,
    precios: [-10, 0, 10]
      .map((x) => precio.valor + x)
      .filter((p) => p > 0)
      .map((p) => {
        const x = desgloseA(p, e, s);
        return { precio: r2(p), beneficio: x.beneficio, margen: p > 0 ? x.beneficio / p : 0 };
      }),
    unidadesMercado,
    escenarios: CUOTAS.map((cuota) => {
      const unidades = Math.round(unidadesMercado * cuota);
      const beneficioMes = r2(unidades * d.beneficio);
      const inversion = r2(unidades * MESES_STOCK_INICIAL * producto + s.lanzamiento);
      return { cuota, unidades, beneficioMes, inversion, mesesRecuperar: beneficioMes > 0 ? Math.round((inversion / beneficioMes) * 10) / 10 : null };
    }),
  };
}

/** Every country of the study, best profit per unit first. */
export function rentabilidadEstudio(estudio: EstudioH10, palabras: Record<string, PalabrasMercado>, supuestos?: SupuestosRentabilidad): RentabilidadPais[] {
  return estudio.mercados.map((m) => rentabilidadPais(estudio, m, palabras[m.codigoPais], supuestos)).sort((a, b) => b.desglose.beneficio - a.desglose.beneficio);
}
