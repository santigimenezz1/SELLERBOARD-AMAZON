import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { diaMadrid, diasEntre, inicioDia, sumarDias } from "./fechas";
import { redondear, type Marketplace } from "./tipos";

export type Metricas = {
  ventas: number;
  unidades: number;
  pedidos: number;
  comisiones: number;
  reembolsos: number;
  /** IVA de las ventas menos el IVA de lo reembolsado: dinero que no es del vendedor. */
  iva: number;
  coste: number;
  /** Suma de beneficioNeto de las líneas que tienen coste. */
  beneficio: number;
  margen: number | null;
  unidadesSinCoste: number;
  /** Pedidos cuyo IVA no lo informó Amazon y se ha estimado con el tipo general del país. */
  pedidosIvaEstimado: number;
  /** Pedidos que Amazon aún no ha liquidado: sus comisiones reales todavía no se conocen (cuentan como 0). */
  pedidosSinLiquidar: number;
};

export type PuntoDia = { dia: string; ventas: number; beneficio: number };

export type FilaProducto = {
  sku: string;
  titulo: string;
  asin: string;
  unidades: number;
  ventas: number;
  comisiones: number;
  reembolsos: number;
  iva: number;
  coste: number | null;
  beneficio: number | null;
  margen: number | null;
  faltaCoste: boolean;
  /** Units per marketplace id. */
  unidadesPorMarketplace: Record<string, number>;
};

export type DatosPanel = { metricas: Metricas; serie: PuntoDia[]; productos: FilaProducto[] };

const CAMPOS = ["amazonOrderId", "fecha", "marketplaceId", "estado", "sku", "asin", "titulo", "unidades", "ventaTotal", "comisionesAmazon", "reembolso", "impuestos", "impuestosReembolso", "ivaEstimado", "costeProducto", "beneficioNeto", "liquidado"];

type Linea = {
  amazonOrderId: string;
  fecha: Timestamp;
  marketplaceId: string;
  estado: string;
  sku: string;
  asin: string;
  titulo: string;
  unidades: number;
  ventaTotal: number;
  comisionesAmazon: number;
  reembolso: number;
  impuestos: number;
  impuestosReembolso?: number;
  ivaEstimado?: boolean;
  costeProducto: number | null;
  beneficioNeto: number | null;
  liquidado: boolean;
};

const ivaNeto = (l: Linea) => (l.impuestos ?? 0) - (l.impuestosReembolso ?? 0);

/** Aggregates the order lines of [desde, hasta] (Madrid days, inclusive), optionally for one marketplace. */
export async function cargarPanel(desde: string, hasta: string, marketplaceId: string | null): Promise<DatosPanel> {
  const snap = await adminDb()
    .collection("pedidos")
    .where("fecha", ">=", Timestamp.fromDate(inicioDia(desde)))
    .where("fecha", "<", Timestamp.fromDate(inicioDia(sumarDias(hasta, 1))))
    .select(...CAMPOS)
    .get();

  const lineas = snap.docs
    .map((d) => d.data() as Linea)
    // The marketplace filter runs here rather than in the query: avoids a composite index, and the volume is small.
    .filter((l) => l.estado !== "CANCELLED" && (!marketplaceId || l.marketplaceId === marketplaceId));

  const m: Metricas = { ventas: 0, unidades: 0, pedidos: 0, comisiones: 0, reembolsos: 0, iva: 0, coste: 0, beneficio: 0, margen: null, unidadesSinCoste: 0, pedidosIvaEstimado: 0, pedidosSinLiquidar: 0 };
  const pedidos = new Set<string>();
  const sinLiquidar = new Set<string>();
  const ivaEstimado = new Set<string>();
  const porDia = new Map<string, PuntoDia>(diasEntre(desde, hasta).map((dia) => [dia, { dia, ventas: 0, beneficio: 0 }]));
  const porSku = new Map<string, FilaProducto>();

  for (const l of lineas) {
    m.ventas += l.ventaTotal;
    m.unidades += l.unidades;
    m.comisiones += l.comisionesAmazon;
    m.reembolsos += l.reembolso;
    m.iva += ivaNeto(l);
    pedidos.add(l.amazonOrderId);
    if (l.ivaEstimado !== false) ivaEstimado.add(l.amazonOrderId);
    if (!l.liquidado) sinLiquidar.add(l.amazonOrderId);
    if (l.costeProducto === null) m.unidadesSinCoste += l.unidades;
    else m.coste += l.costeProducto;
    if (l.beneficioNeto !== null) m.beneficio += l.beneficioNeto;

    const dia = porDia.get(diaMadrid(l.fecha.toDate()));
    if (dia) {
      dia.ventas += l.ventaTotal;
      dia.beneficio += l.beneficioNeto ?? 0;
    }

    const p = porSku.get(l.sku) ?? { sku: l.sku, titulo: l.titulo, asin: l.asin, unidades: 0, ventas: 0, comisiones: 0, reembolsos: 0, iva: 0, coste: 0, beneficio: 0, margen: null, faltaCoste: false, unidadesPorMarketplace: {} };
    p.unidades += l.unidades;
    p.unidadesPorMarketplace[l.marketplaceId] = (p.unidadesPorMarketplace[l.marketplaceId] ?? 0) + l.unidades;
    p.ventas += l.ventaTotal;
    p.comisiones += l.comisionesAmazon;
    p.reembolsos += l.reembolso;
    p.iva += ivaNeto(l);
    if (l.costeProducto === null) p.faltaCoste = true;
    else p.coste = (p.coste ?? 0) + l.costeProducto;
    p.beneficio = (p.beneficio ?? 0) + (l.beneficioNeto ?? 0);
    porSku.set(l.sku, p);
  }

  m.pedidos = pedidos.size;
  m.pedidosSinLiquidar = sinLiquidar.size;
  m.pedidosIvaEstimado = ivaEstimado.size;
  for (const k of ["ventas", "comisiones", "reembolsos", "iva", "coste", "beneficio"] as const) m[k] = redondear(m[k]);
  // Margin over net sales (without VAT) of the lines that have a cost, so lines without one don't dilute it.
  const ventasNetasConCoste = lineas.filter((l) => l.costeProducto !== null).reduce((s, l) => s + l.ventaTotal - ivaNeto(l), 0);
  m.margen = ventasNetasConCoste > 0 ? (m.beneficio / ventasNetasConCoste) * 100 : null;

  const productos = [...porSku.values()].map((p) => {
    const fila = { ...p, ventas: redondear(p.ventas), comisiones: redondear(p.comisiones), reembolsos: redondear(p.reembolsos), iva: redondear(p.iva) };
    if (p.faltaCoste) return { ...fila, coste: null, beneficio: null, margen: null };
    const beneficio = redondear(p.beneficio ?? 0);
    return { ...fila, coste: redondear(p.coste ?? 0), beneficio, margen: p.ventas - p.iva > 0 ? (beneficio / (p.ventas - p.iva)) * 100 : null };
  });

  const serie = [...porDia.values()].map((d) => ({ ...d, ventas: redondear(d.ventas), beneficio: redondear(d.beneficio) }));
  return { metricas: m, serie, productos };
}

export async function cargarMarketplaces(): Promise<Marketplace[]> {
  const snap = await adminDb().collection("config").doc("marketplaces").get();
  return ((snap.get("lista") as Marketplace[] | undefined) ?? []).slice().sort((a, b) => a.pais.localeCompare(b.pais, "es"));
}

export type UltimaSync = { fecha: Date; pedidosNuevos: number; errores: string[] | null } | null;

export async function cargarUltimaSync(): Promise<UltimaSync> {
  const d = (await adminDb().collection("sincronizaciones").orderBy("fecha", "desc").limit(1).get()).docs[0];
  if (!d) return null;
  return { fecha: (d.get("fecha") as Timestamp).toDate(), pedidosNuevos: d.get("pedidosNuevos") as number, errores: (d.get("errores") as string[] | null) ?? null };
}

export type UnidadesPais = { marketplaceId: string; pais: string; codigoPais: string; unidades: number };
export type ProductoVendido = { sku: string; asin: string; titulo: string; unidades: number; imagen: string | null; porPais: UnidadesPais[] };

/** Simplified phase-1 table: units per SKU plus the listing photo stored by the sync (`productos/{asin}`). */
export async function productosVendidos(productos: FilaProducto[], marketplaces: Marketplace[]): Promise<ProductoVendido[]> {
  const mk = new Map(marketplaces.map((m) => [m.id, m]));
  const asins = [...new Set(productos.map((p) => p.asin).filter(Boolean))];
  const db = adminDb();
  const docs = asins.length ? await db.getAll(...asins.map((a) => db.collection("productos").doc(a))) : [];
  const imagenes = new Map(docs.filter((d) => d.exists).map((d) => [d.id, (d.get("imagen") as string | null) ?? null]));
  return productos
    .map((p) => ({
      sku: p.sku,
      asin: p.asin,
      titulo: p.titulo,
      unidades: p.unidades,
      imagen: imagenes.get(p.asin) ?? null,
      porPais: Object.entries(p.unidadesPorMarketplace)
        .map(([id, unidades]) => ({ marketplaceId: id, pais: mk.get(id)?.pais ?? id, codigoPais: mk.get(id)?.codigoPais ?? "", unidades }))
        .sort((a, b) => b.unidades - a.unidades),
    }))
    .sort((a, b) => b.unidades - a.unidades);
}
