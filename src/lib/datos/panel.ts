import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { diaMadrid, diasEntre } from "./fechas";
import { redondear, type Marketplace } from "./tipos";
import { BLOQUEO_MS } from "@/lib/amazon/sincronizar";
import { asegurarAlmacen, pedidosEnAlmacen } from "./almacen";
import { contarLecturas } from "./consumo";

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
/**
 * Profit figures (hidden in the simplified phase 1). Computed from the in-memory mirror, never by querying
 * `pedidos`: `version` is the latest sync id, as for the sales dashboard.
 */
export async function cargarPanel(desde: string, hasta: string, marketplaceId: string | null, version: string | null): Promise<DatosPanel> {
  await asegurarAlmacen(version);
  const lineas = [...pedidosEnAlmacen().values()]
    .map((p) => ({ ...p, fecha: Timestamp.fromDate(p.fecha) }) as Linea)
    .filter((l) => {
      const dia = diaMadrid(l.fecha.toDate());
      return dia >= desde && dia <= hasta;
    })
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
  contarLecturas(1);
  return ((snap.get("lista") as Marketplace[] | undefined) ?? []).slice().sort((a, b) => a.pais.localeCompare(b.pais, "es"));
}

/** `id` doubles as the version of the in-memory sales cache (lib/datos/cache.ts). */
export type UltimaSync = { id: string; fecha: Date; pedidosNuevos: number; errores: string[] | null } | null;

export async function cargarUltimaSync(): Promise<UltimaSync> {
  const d = (await adminDb().collection("sincronizaciones").orderBy("fecha", "desc").limit(1).get()).docs[0];
  contarLecturas(1);
  if (!d) return null;
  return { id: d.id, fecha: (d.get("fecha") as Timestamp).toDate(), pedidosNuevos: d.get("pedidosNuevos") as number, errores: (d.get("errores") as string[] | null) ?? null };
}

/** True while a sync holds the lock, so the dashboard can wait for it and refresh itself. */
export async function syncEnCurso(): Promise<boolean> {
  const desde = (await adminDb().collection("config").doc("sync").get()).get("enCursoDesde") as Timestamp | undefined;
  contarLecturas(1);
  return !!desde && Date.now() - desde.toMillis() < BLOQUEO_MS;
}

