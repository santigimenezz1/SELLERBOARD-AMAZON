import "server-only";

import { asegurarAlmacen, pedidosEnAlmacen } from "./almacen";
import { idUltimaSync } from "./panel";
import { diaMadrid } from "./fechas";
import { MARKETPLACE_UK, costeTotal, obtenerEscandallo, regionDeMarketplace, type RegionCoste } from "./escandallos";
import { obtenerGastos, type CategoriaGasto, type LineaGasto } from "./gastos";
import { obtenerIngresos, type Compensacion } from "./ingresos";
import { tarifasDeSkus } from "./tarifasVenta";
import type { TarifaVenta } from "@/lib/amazon/finanzas";

/*
 * The account's profit and loss, month by month, the way an accountant would lay it out (accrual basis):
 *
 *   Sales (VAT included)                          orders placed in the month (cancelled ones out)
 * − VAT on those sales                            not the seller's money: it's paid to the tax office
 * − Amazon's per-sale fees                        referral, FBA fulfilment… (real once Amazon settles the
 *                                                 order; before that, estimated like the product page does:
 *                                                 the fees of the latest real sale of that SKU there, the
 *                                                 FBA fee fixed and the referral scaled to the price)
 * − Customer refunds (without their VAT)          of the month's orders
 * + Amazon's compensations                        lost/damaged units, refunds never returned…
 * = What Amazon leaves you from your sales
 * − Account charges                               storage, ads, subscription… in the month they belong to
 *                                                 (storage charged on the 7th is last month's); a charge
 *                                                 not billed yet (storage, ads, the subscription) is
 *                                                 estimated with the latest month actually billed
 * = Result before the cost of the goods
 * − Cost of the goods sold                        units sold × their unit cost from the product's cost
 *                                                 breakdown (freight and duties included); a product whose
 *                                                 breakdown was never saved has no cost and is listed apart
 * = Result of the month
 *
 * Amazon's fees and charges keep the VAT Amazon adds to them: if it's deducted in the VAT returns, the real
 * result is a bit better. Everything in euros (other currencies at the ECB rate of their day).
 */

export type Region = "eu" | "uk";
type PorRegion = Record<Region, number>;
const cero = (): PorRegion => ({ eu: 0, uk: 0 });

/**
 * A charge not billed yet, estimated with the latest billed month. In the current month only the part of the
 * days gone by counts (`dias` of `diasMes`), like its sales: the whole amount once the month is over.
 */
export type GastoEstimado = { categoria: CategoriaGasto; region: Region; eur: number; cobro: string; dias: number | null; diasMes: number | null };

export type MesContable = {
  mes: string;
  enCurso: boolean;
  pedidos: number;
  unidades: PorRegion;
  ventas: PorRegion;
  iva: PorRegion;
  comisiones: PorRegion;
  /** Part of `comisiones` estimated for orders Amazon hasn't settled yet. */
  comisionesEstimadas: number;
  pedidosSinLiquidar: number;
  devoluciones: PorRegion;
  compensaciones: Compensacion[];
  gastos: LineaGasto[];
  gastosEstimados: GastoEstimado[];
  coste: PorRegion;
  unidadesSinCoste: number;
  /** Products sold this month without a saved cost breakdown. */
  sinCoste: { asin: string; titulo: string; region: RegionCoste; unidades: number }[];
};

const PRIMER_MES = "2026-01";
const r2 = (v: number) => Math.round(v * 100) / 100;
const mesAnterior = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};
/** "2026-10-06" + n days, as "YYYY-MM-DD". */
const sumarDiasMes = (dia: string, n: number) => {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};
const mesSiguiente = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
};

// Charges billed after the month they belong to: the day of the next month Amazon bills them.
const COBRO_POSTERIOR: Partial<Record<CategoriaGasto, number>> = { almacenamiento: 7, publicidad: 2 };
/** The monthly subscription is billed around this day of its own month. */
const DIA_SUSCRIPCION = 6;

/**
 * Fees of one unit at a given price from a real sale's fees (same maths as the product page): the referral fee
 * and the digital services fee scale with the price, the FBA fee doesn't.
 */
function tarifasA(m: TarifaVenta, precio: number): number {
  const comision = m.comision * (precio / m.precio);
  const digitales = m.comision > 0 ? comision * (m.serviciosDigitales / m.comision) : m.serviciosDigitales;
  return comision + digitales + m.fba + m.otras;
}

export async function obtenerContabilidad(ahora = new Date()): Promise<MesContable[]> {
  await asegurarAlmacen(await idUltimaSync());
  const [gastosDatos, ingresos] = await Promise.all([obtenerGastos(), obtenerIngresos()]);
  const hoy = diaMadrid(ahora);
  const mesActual = hoy.slice(0, 7);

  const meses = new Map<string, MesContable>();
  for (let m = PRIMER_MES; m <= mesActual; m = mesSiguiente(m))
    meses.set(m, {
      mes: m,
      enCurso: m === mesActual,
      pedidos: 0,
      unidades: cero(),
      ventas: cero(),
      iva: cero(),
      comisiones: cero(),
      comisionesEstimadas: 0,
      pedidosSinLiquidar: 0,
      devoluciones: cero(),
      compensaciones: [],
      gastos: [],
      gastosEstimados: [],
      coste: cero(),
      unidadesSinCoste: 0,
      sinCoste: [],
    });

  const lineas = [...pedidosEnAlmacen().values()].filter((p) => p.estado !== "CANCELLED");

  // Fee rate (fees ÷ sale) of each SKU in each marketplace, from its settled sales without refunds: used for
  // the orders Amazon hasn't settled yet.
  const tasas = new Map<string, { fees: number; ventas: number }>();
  const acumular = (k: string, fees: number, ventas: number) => {
    const t = tasas.get(k) ?? { fees: 0, ventas: 0 };
    t.fees += fees;
    t.ventas += ventas;
    tasas.set(k, t);
  };
  for (const p of lineas)
    if (p.liquidado && p.reembolso === 0 && p.ventaTotal > 0 && p.comisionesAmazon > 0) {
      acumular(`${p.sku}|${p.marketplaceId}`, p.comisionesAmazon, p.ventaTotal);
      acumular(p.marketplaceId, p.comisionesAmazon, p.ventaTotal);
      acumular("*", p.comisionesAmazon, p.ventaTotal);
    }
  const tasa = (sku: string, mk: string) => {
    for (const k of [`${sku}|${mk}`, mk, "*"]) {
      const t = tasas.get(k);
      if (t && t.ventas > 0) return t.fees / t.ventas;
    }
    return 0;
  };
  // Latest real sale's fees of each unsettled SKU, per marketplace (the product page's «Lo que te paga Amazon»).
  const muestras = new Map<string, Record<string, TarifaVenta>>();
  for (const sku of new Set(lineas.filter((p) => !p.liquidado).map((p) => p.sku))) muestras.set(sku, await tarifasDeSkus([sku]));
  /** Estimated fees (euros) of an order line Amazon hasn't settled yet. */
  const estimarTarifas = (p: (typeof lineas)[number]) => {
    if (p.ventaTotal <= 0 || p.unidades <= 0) return 0;
    const m = muestras.get(p.sku)?.[p.marketplaceId];
    // Without a real sale of that SKU there (or in another currency), the average rate of its settled sales.
    if (!m || m.moneda !== p.moneda || !(p.tipoCambio > 0)) return p.ventaTotal * tasa(p.sku, p.marketplaceId);
    const precio = p.ventaTotal / p.tipoCambio / p.unidades;
    return tarifasA(m, precio) * p.unidades * p.tipoCambio;
  };

  // Unit cost of each product and region, from its saved cost breakdown (the made-up example isn't a cost).
  const costes = new Map<string, number | null>();
  for (const p of lineas) {
    const k = `${p.asin}|${regionDeMarketplace(p.marketplaceId)}`;
    if (costes.has(k)) continue;
    const e = await obtenerEscandallo(p.asin, regionDeMarketplace(p.marketplaceId));
    const c = costeTotal(e);
    costes.set(k, e.actualizadoEn && c > 0 ? c : null);
  }

  const pedidos = new Map<string, Set<string>>();
  const sinLiquidar = new Map<string, Set<string>>();
  for (const p of lineas) {
    const m = meses.get(diaMadrid(p.fecha).slice(0, 7));
    if (!m) continue;
    const r: Region = p.marketplaceId === MARKETPLACE_UK ? "uk" : "eu";
    m.unidades[r] += p.unidades;
    m.ventas[r] += p.ventaTotal;
    m.iva[r] += p.impuestos;
    m.devoluciones[r] += p.reembolso - (p.impuestosReembolso ?? 0);
    if (p.liquidado) m.comisiones[r] += p.comisionesAmazon;
    else {
      const estimada = estimarTarifas(p);
      m.comisiones[r] += estimada;
      m.comisionesEstimadas += estimada;
      (sinLiquidar.get(m.mes) ?? sinLiquidar.set(m.mes, new Set()).get(m.mes)!).add(p.amazonOrderId);
    }
    const unitario = costes.get(`${p.asin}|${r}`) ?? null;
    if (p.costeProducto !== null) m.coste[r] += p.costeProducto;
    else if (unitario !== null) m.coste[r] += unitario * p.unidades;
    else {
      m.unidadesSinCoste += p.unidades;
      const x = m.sinCoste.find((s) => s.asin === p.asin && s.region === r);
      if (x) x.unidades += p.unidades;
      else m.sinCoste.push({ asin: p.asin, titulo: p.titulo, region: r, unidades: p.unidades });
    }
    (pedidos.get(m.mes) ?? pedidos.set(m.mes, new Set()).get(m.mes)!).add(p.amazonOrderId);
  }

  for (const c of Object.values(ingresos.compensaciones)) meses.get(c.mes)?.compensaciones.push(c);
  // Customer refunds are already counted per order above; AGL is part of the goods' unit cost.
  for (const l of gastosDatos.lineas) if (l.categoria !== "agl" && l.categoria !== "devoluciones") meses.get(l.mes)?.gastos.push(l);

  // Real charges of a category in the latest month before `desde` (inclusive) that has them, up to 4 months back:
  // the month just before may not be billed yet either (September's storage comes on 7 October).
  const ultimoCobrado = (cat: CategoriaGasto, desde: string) => {
    for (let k = desde, i = 0; i < 4; k = mesAnterior(k), i++) {
      const ls = meses.get(k)?.gastos.filter((l) => l.categoria === cat) ?? [];
      if (ls.length) return ls;
    }
    return [];
  };
  const [anio, mesNum, diaHoy] = hoy.split("-").map(Number);
  const diasMesActual = new Date(Date.UTC(anio, mesNum, 0)).getUTCDate();
  const estimar = (m: MesContable, cat: CategoriaGasto, cobro: string) => {
    const previo = ultimoCobrado(cat, mesAnterior(m.mes));
    // The current month shows its sales up to today: its charges too, the share of the days gone by.
    const parte = m.enCurso ? diaHoy / diasMesActual : 1;
    for (const r of ["eu", "uk"] as const) {
      const eur = previo.filter((l) => l.region === r).reduce((s, l) => s + l.eur, 0);
      if (eur > 0)
        m.gastosEstimados.push({ categoria: cat, region: r, eur: r2(eur * parte), cobro, dias: m.enCurso ? diaHoy : null, diasMes: m.enCurso ? diasMesActual : null });
    }
  };
  for (const m of meses.values()) {
    // Storage and ads billed next month: while their bill hasn't come, estimated with the latest billed month.
    for (const [cat, dia] of Object.entries(COBRO_POSTERIOR) as [CategoriaGasto, number][]) {
      const cobro = `${mesSiguiente(m.mes)}-${String(dia).padStart(2, "0")}`;
      if (hoy > cobro || m.gastos.some((l) => l.categoria === cat)) continue;
      estimar(m, cat, cobro);
    }
    // The subscription of the current month, until it's billed (a few days' margin after the usual day).
    const cobroSuscripcion = `${m.mes}-${String(DIA_SUSCRIPCION).padStart(2, "0")}`;
    if (m.enCurso && hoy <= sumarDiasMes(cobroSuscripcion, 6) && !m.gastos.some((l) => l.categoria === "suscripcion")) estimar(m, "suscripcion", cobroSuscripcion);
  }

  for (const m of meses.values()) {
    m.pedidos = pedidos.get(m.mes)?.size ?? 0;
    m.pedidosSinLiquidar = sinLiquidar.get(m.mes)?.size ?? 0;
    m.comisionesEstimadas = r2(m.comisionesEstimadas);
    for (const k of ["ventas", "iva", "comisiones", "devoluciones", "coste"] as const) m[k] = { eu: r2(m[k].eu), uk: r2(m[k].uk) };
    m.compensaciones.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }
  return [...meses.values()];
}
export type DatosContabilidad = Awaited<ReturnType<typeof obtenerContabilidad>>;
