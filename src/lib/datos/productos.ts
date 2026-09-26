import "server-only";

import { datosVentas, fichasEnAlmacen, productosEnAlmacen, transaccionesEnAlmacen } from "./almacen";
import { cargarMarketplaces, cargarUltimaSync } from "./panel";
import { obtenerStock, type CantidadesStock, type Region } from "./stock";
import { diaMadrid, sumarDias } from "./fechas";
import type { Ficha, FichaMercado, PrecioMercado } from "./fichas";
import type { Marketplace } from "./tipos";

/*
 * Data for the Products section, assembled from the in-memory mirror (no
 * Firestore queries): listing cards, FBA stock and the last 30 days of sales.
 */

const ES = "A1RKKUPIHCS9HS";

export type ResumenProducto = {
  asin: string;
  skus: string[];
  titulo: string;
  imagen: string | null;
  /** Price shown on the card: amazon.es when listed there, else the first market with an offer. */
  precio: (PrecioMercado & { marketplaceId: string }) | null;
  ranking: FichaMercado["ranking"][number] | null;
  mercadosConOferta: string[];
  stockVendible: number;
  unidades30: number;
  ventas30: number;
  activo: boolean;
};

export type DetalleProducto = {
  asin: string;
  skus: string[];
  ficha: Ficha | null;
  marketplaces: Marketplace[];
  regiones: Region[];
  stockPorRegion: Record<string, CantidadesStock>;
  /** Last 30 days, per marketplace id ("*" = all). */
  ventas: Record<string, { unidades: number; ventas: number; pedidos: number }>;
  reembolsos30: Record<string, number>;
  imagenRespaldo: string | null;
  tituloRespaldo: string | null;
};

async function base() {
  const [ultima, marketplaces, stock] = await Promise.all([cargarUltimaSync(), cargarMarketplaces(), obtenerStock()]);
  const { lineas } = await datosVentas(ultima?.id ?? null);
  return { marketplaces, stock, lineas };
}

function hace30(): string {
  return sumarDias(diaMadrid(new Date()), -29);
}

const tituloReal = (t: string | undefined | null) => (t && t.trim().length > 1 ? t : null);

export async function listarProductos(): Promise<{ productos: ResumenProducto[]; marketplaces: Marketplace[] }> {
  const { marketplaces, stock, lineas } = await base();
  const desde = hace30();
  const asins = new Set<string>([...fichasEnAlmacen().keys()]);
  const skus = new Map<string, Set<string>>();
  const titulos = new Map<string, string>();
  const ventas = new Map<string, { u: number; v: number }>();
  const anotarSku = (asin: string, sku: string) => {
    if (!asin || !sku) return;
    asins.add(asin);
    skus.set(asin, (skus.get(asin) ?? new Set()).add(sku));
  };
  for (const l of lineas) {
    anotarSku(l.asin, l.sku);
    if (!titulos.has(l.asin) && tituloReal(l.titulo)) titulos.set(l.asin, l.titulo);
    if (l.estado !== "CANCELLED" && diaMadrid(l.fecha) >= desde) {
      const s = ventas.get(l.asin) ?? { u: 0, v: 0 };
      s.u += l.unidades;
      s.v += l.ventaTotal;
      ventas.set(l.asin, s);
    }
  }
  const stockPorAsin = new Map<string, number>();
  for (const a of stock?.articulos ?? []) {
    anotarSku(a.asin, a.sku);
    if (!titulos.has(a.asin) && tituloReal(a.nombre)) titulos.set(a.asin, a.nombre);
    stockPorAsin.set(a.asin, (stockPorAsin.get(a.asin) ?? 0) + Object.values(a.porRegion).reduce((s, c) => s + c.vendible, 0));
  }

  const productos = [...asins].map((asin): ResumenProducto => {
    const f = fichasEnAlmacen().get(asin);
    const mES = f?.mercados[ES];
    const primerMercado = mES ?? Object.values(f?.mercados ?? {})[0];
    const mercadosConOferta = Object.keys(f?.precios ?? {});
    const idPrecio = f?.precios[ES] ? ES : mercadosConOferta[0];
    const s = ventas.get(asin) ?? { u: 0, v: 0 };
    const stockVendible = stockPorAsin.get(asin) ?? 0;
    return {
      asin,
      skus: [...(skus.get(asin) ?? [])].sort(),
      titulo: tituloReal(primerMercado?.titulo) ?? titulos.get(asin) ?? asin,
      imagen: primerMercado?.imagenes[0] ?? productosEnAlmacen().get(asin)?.imagen ?? null,
      precio: idPrecio ? { ...f!.precios[idPrecio], marketplaceId: idPrecio } : null,
      ranking: primerMercado?.ranking.at(-1) ?? null,
      mercadosConOferta,
      stockVendible,
      unidades30: s.u,
      ventas30: Math.round(s.v * 100) / 100,
      activo: mercadosConOferta.length > 0 || stockVendible > 0 || s.u > 0,
    };
  });
  productos.sort((a, b) => Number(b.activo) - Number(a.activo) || b.unidades30 - a.unidades30 || b.stockVendible - a.stockVendible || a.titulo.localeCompare(b.titulo, "es"));
  return { productos, marketplaces };
}

export async function detalleProducto(asin: string): Promise<DetalleProducto> {
  const { marketplaces, stock, lineas } = await base();
  const desde = hace30();
  const skus = new Set<string>();
  const ventas: DetalleProducto["ventas"] = {};
  let tituloRespaldo: string | null = null;
  const pedidos: Record<string, Set<string>> = {};
  for (const l of lineas) {
    if (l.asin !== asin) continue;
    skus.add(l.sku);
    tituloRespaldo ??= tituloReal(l.titulo);
    if (l.estado === "CANCELLED" || diaMadrid(l.fecha) < desde) continue;
    for (const clave of [l.marketplaceId, "*"]) {
      const v = (ventas[clave] ??= { unidades: 0, ventas: 0, pedidos: 0 });
      v.unidades += l.unidades;
      v.ventas += l.ventaTotal;
      (pedidos[clave] ??= new Set()).add(l.amazonOrderId);
      v.pedidos = pedidos[clave].size;
    }
  }
  const stockPorRegion: Record<string, CantidadesStock> = {};
  for (const a of stock?.articulos ?? []) {
    if (a.asin !== asin) continue;
    skus.add(a.sku);
    for (const [region, c] of Object.entries(a.porRegion)) {
      const t = (stockPorRegion[region] ??= { total: 0, vendible: 0, reservado: 0, enCamino: 0, noVendible: 0, investigando: 0 });
      for (const k of Object.keys(t) as (keyof CantidadesStock)[]) t[k] += c[k];
    }
  }
  const reembolsos30: Record<string, number> = {};
  const inicio = new Date(Date.now() - 30 * 86_400_000);
  for (const t of transaccionesEnAlmacen().values()) {
    if (t.fechaPublicacion < inicio || !t.lineas.some((l) => l.reembolso > 0 && l.sku && skus.has(l.sku))) continue;
    for (const clave of [t.marketplaceId ?? "", "*"]) reembolsos30[clave] = (reembolsos30[clave] ?? 0) + 1;
  }
  return {
    asin,
    skus: [...skus].sort(),
    ficha: fichasEnAlmacen().get(asin) ?? null,
    marketplaces,
    regiones: stock?.regiones ?? [],
    stockPorRegion,
    ventas,
    reembolsos30,
    imagenRespaldo: productosEnAlmacen().get(asin)?.imagen ?? null,
    tituloRespaldo,
  };
}
