import { diaMadrid, diasEntre, sumarDias } from "./fechas";

/**
 * Sales aggregation for the dashboard tiles and product list. Pure (no
 * Firestore): the page feeds it the order lines it read, the demo feeds it
 * made-up ones.
 */

export type LineaVenta = {
  amazonOrderId: string;
  fecha: Date;
  marketplaceId: string;
  estado: string;
  sku: string;
  asin: string;
  titulo: string;
  unidades: number;
  ventaTotal: number;
};

/** A refund, dated when Amazon refunded it (not when the order was placed), like Sellerboard counts them. */
export type LineaReembolso = { amazonOrderId: string; fecha: Date; marketplaceId: string | null; sku: string | null; importe: number };

export type ResumenVentas = {
  ventas: number;
  unidades: number;
  pedidos: number;
  /** Orders refunded within the period. */
  reembolsos: number;
};

export type ProductoPeriodo = {
  sku: string;
  asin: string;
  titulo: string;
  unidades: number;
  ventas: number;
  /** Orders of this product refunded within the period (by refund date). */
  reembolsos: number;
  /** Average selling price per unit in the period (ventas / unidades), null if nothing sold. */
  precioMedio: number | null;
  imagen: string | null;
  /** Units per marketplace id, most sold first. */
  porMarketplace: { marketplaceId: string; unidades: number }[];
};

function delPeriodo(lineas: LineaVenta[], desde: string, hasta: string, marketplaceId: string | null): LineaVenta[] {
  return lineas.filter((l) => {
    if (l.estado === "CANCELLED") return false;
    if (marketplaceId && l.marketplaceId !== marketplaceId) return false;
    const dia = diaMadrid(l.fecha);
    return dia >= desde && dia <= hasta;
  });
}

function reembolsosDelPeriodo(reembolsos: LineaReembolso[], desde: string, hasta: string, marketplaceId: string | null): LineaReembolso[] {
  return reembolsos.filter((r) => {
    if (marketplaceId && r.marketplaceId !== marketplaceId) return false;
    const dia = diaMadrid(r.fecha);
    return dia >= desde && dia <= hasta;
  });
}

const redondear = (v: number) => Math.round(v * 100) / 100;

export function resumenVentas(lineas: LineaVenta[], reembolsos: LineaReembolso[], desde: string, hasta: string, marketplaceId: string | null): ResumenVentas {
  const sel = delPeriodo(lineas, desde, hasta, marketplaceId);
  return {
    ventas: redondear(sel.reduce((s, l) => s + l.ventaTotal, 0)),
    unidades: sel.reduce((s, l) => s + l.unidades, 0),
    pedidos: new Set(sel.map((l) => l.amazonOrderId)).size,
    reembolsos: new Set(reembolsosDelPeriodo(reembolsos, desde, hasta, marketplaceId).map((r) => r.amazonOrderId)).size,
  };
}

/**
 * Products sold or refunded in the period. A product refunded but not sold in
 * the period still gets a row (0 units), like Sellerboard; its ASIN and title
 * come from any loaded order line of that SKU.
 */
export function productosDelPeriodo(lineas: LineaVenta[], reembolsos: LineaReembolso[], desde: string, hasta: string, marketplaceId: string | null): ProductoPeriodo[] {
  type Acumulado = ProductoPeriodo & { mk: Map<string, number>; pedidosReembolsados: Set<string> };
  const porSku = new Map<string, Acumulado>();
  const fichaDe = new Map(lineas.map((l) => [l.sku, { asin: l.asin, titulo: l.titulo }]));
  const nuevo = (sku: string): Acumulado => ({
    sku,
    asin: fichaDe.get(sku)?.asin ?? "",
    titulo: fichaDe.get(sku)?.titulo ?? "",
    unidades: 0,
    ventas: 0,
    reembolsos: 0,
    precioMedio: null,
    imagen: null,
    porMarketplace: [],
    mk: new Map(),
    pedidosReembolsados: new Set(),
  });

  for (const l of delPeriodo(lineas, desde, hasta, marketplaceId)) {
    const p = porSku.get(l.sku) ?? nuevo(l.sku);
    p.unidades += l.unidades;
    p.ventas += l.ventaTotal;
    p.mk.set(l.marketplaceId, (p.mk.get(l.marketplaceId) ?? 0) + l.unidades);
    porSku.set(l.sku, p);
  }
  // Refunds Amazon didn't tie to a SKU can't be placed on a product row (they still count in the tiles).
  for (const r of reembolsosDelPeriodo(reembolsos, desde, hasta, marketplaceId)) {
    if (!r.sku) continue;
    const p = porSku.get(r.sku) ?? nuevo(r.sku);
    p.pedidosReembolsados.add(r.amazonOrderId);
    porSku.set(r.sku, p);
  }

  return [...porSku.values()]
    .map(({ mk, pedidosReembolsados, ...p }) => ({
      ...p,
      ventas: redondear(p.ventas),
      reembolsos: pedidosReembolsados.size,
      precioMedio: p.unidades > 0 ? redondear(p.ventas / p.unidades) : null,
      porMarketplace: [...mk].map(([marketplaceId, unidades]) => ({ marketplaceId, unidades })).sort((a, b) => b.unidades - a.unidades),
    }))
    .sort((a, b) => b.unidades - a.unidades || b.ventas - a.ventas);
}

export type PuntoVentas = {
  dia: string;
  ventas: number;
  unidades: number;
  /** Average of this day and the 6 before it (null for days still to come). */
  mediaVentas: number | null;
  mediaUnidades: number | null;
  /** The day is still to come (rest of the current month). */
  futuro: boolean;
};

/** One point per day of [desde, hasta]. `lineas` must also cover the 6 days before `desde`, for the moving average. */
export function serieDiaria(lineas: LineaVenta[], desde: string, hasta: string, hoy: string, marketplaceId: string | null): PuntoVentas[] {
  const porDia = new Map<string, { ventas: number; unidades: number }>();
  for (const l of delPeriodo(lineas, sumarDias(desde, -6), hasta, marketplaceId)) {
    const dia = diaMadrid(l.fecha);
    const d = porDia.get(dia) ?? { ventas: 0, unidades: 0 };
    d.ventas += l.ventaTotal;
    d.unidades += l.unidades;
    porDia.set(dia, d);
  }
  return diasEntre(desde, hasta).map((dia) => {
    const futuro = dia > hoy;
    const ventana = diasEntre(sumarDias(dia, -6), dia).map((x) => porDia.get(x) ?? { ventas: 0, unidades: 0 });
    const d = porDia.get(dia) ?? { ventas: 0, unidades: 0 };
    return {
      dia,
      ventas: redondear(d.ventas),
      unidades: d.unidades,
      mediaVentas: futuro ? null : redondear(ventana.reduce((s, x) => s + x.ventas, 0) / 7),
      mediaUnidades: futuro ? null : Math.round((ventana.reduce((s, x) => s + x.unidades, 0) / 7) * 10) / 10,
      futuro,
    };
  });
}
