import "server-only";

import { asegurarAlmacen, pedidosEnAlmacen } from "./almacen";
import { idUltimaSync } from "./panel";
import { diaMadrid } from "./fechas";
import { MARKETPLACE_UK, costeTotal, obtenerEscandallo, regionDeMarketplace, type RegionCoste } from "./escandallos";
import { obtenerGastos, type CategoriaGasto, type LineaGasto } from "./gastos";
import { obtenerIngresos, type Compensacion } from "./ingresos";

/*
 * The account's profit and loss, month by month, the way an accountant would lay it out (accrual basis):
 *
 *   Sales (VAT included)                          orders placed in the month (cancelled ones out)
 * − VAT on those sales                            not the seller's money: it's paid to the tax office
 * − Amazon's per-sale fees                        referral, FBA fulfilment… (real once Amazon settles the
 *                                                 order; before that, estimated with the SKU's own fee rate)
 * − Customer refunds (without their VAT)          of the month's orders
 * + Amazon's compensations                        lost/damaged units, refunds never returned…
 * = What Amazon leaves you from your sales
 * − Account charges                               storage, ads, subscription… in the month they belong to
 *                                                 (storage charged on the 7th is last month's); a charge
 *                                                 not billed yet is estimated with the previous month's
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

export type GastoEstimado = { categoria: CategoriaGasto; region: Region; eur: number; cobro: string };

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
const mesSiguiente = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
};

// Charges billed after the month they belong to: the day of the next month Amazon bills them.
const COBRO_POSTERIOR: Partial<Record<CategoriaGasto, number>> = { almacenamiento: 7, publicidad: 2 };

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
      const estimada = p.ventaTotal * tasa(p.sku, p.marketplaceId);
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

  // Storage and ads billed next month: while their bill hasn't come, estimated with the previous month's.
  for (const m of meses.values()) {
    for (const [cat, dia] of Object.entries(COBRO_POSTERIOR) as [CategoriaGasto, number][]) {
      const siguiente = mesSiguiente(m.mes);
      const cobro = `${siguiente}-${String(dia).padStart(2, "0")}`;
      if (hoy > cobro || m.gastos.some((l) => l.categoria === cat)) continue;
      const previo = meses.get(mesAnterior(m.mes))?.gastos.filter((l) => l.categoria === cat) ?? [];
      for (const r of ["eu", "uk"] as const) {
        const eur = previo.filter((l) => l.region === r).reduce((s, l) => s + l.eur, 0);
        if (eur > 0) m.gastosEstimados.push({ categoria: cat, region: r, eur: r2(eur), cobro });
      }
    }
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
