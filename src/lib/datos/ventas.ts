import { diaMadrid } from "./fechas";

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

const redondear = (v: number) => Math.round(v * 100) / 100;

export function resumenVentas(lineas: LineaVenta[], reembolsos: LineaReembolso[], desde: string, hasta: string, marketplaceId: string | null): ResumenVentas {
  const sel = delPeriodo(lineas, desde, hasta, marketplaceId);
  const reemb = reembolsos.filter((r) => {
    if (marketplaceId && r.marketplaceId !== marketplaceId) return false;
    const dia = diaMadrid(r.fecha);
    return dia >= desde && dia <= hasta;
  });
  return {
    ventas: redondear(sel.reduce((s, l) => s + l.ventaTotal, 0)),
    unidades: sel.reduce((s, l) => s + l.unidades, 0),
    pedidos: new Set(sel.map((l) => l.amazonOrderId)).size,
    reembolsos: new Set(reemb.map((r) => r.amazonOrderId)).size,
  };
}

export function productosDelPeriodo(lineas: LineaVenta[], desde: string, hasta: string, marketplaceId: string | null): ProductoPeriodo[] {
  const porSku = new Map<string, ProductoPeriodo & { mk: Map<string, number> }>();
  for (const l of delPeriodo(lineas, desde, hasta, marketplaceId)) {
    const p = porSku.get(l.sku) ?? { sku: l.sku, asin: l.asin, titulo: l.titulo, unidades: 0, ventas: 0, imagen: null, porMarketplace: [], mk: new Map() };
    p.unidades += l.unidades;
    p.ventas += l.ventaTotal;
    p.mk.set(l.marketplaceId, (p.mk.get(l.marketplaceId) ?? 0) + l.unidades);
    porSku.set(l.sku, p);
  }
  return [...porSku.values()]
    .map(({ mk, ...p }) => ({
      ...p,
      ventas: redondear(p.ventas),
      porMarketplace: [...mk].map(([marketplaceId, unidades]) => ({ marketplaceId, unidades })).sort((a, b) => b.unidades - a.unidades),
    }))
    .sort((a, b) => b.unidades - a.unidades || b.ventas - a.ventas);
}
