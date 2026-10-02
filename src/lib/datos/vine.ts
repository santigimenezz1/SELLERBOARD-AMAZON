import "server-only";

import { asegurarAlmacen, pedidosEnAlmacen } from "./almacen";
import { idUltimaSync } from "./panel";
import { diaMadrid } from "./fechas";
import { marketplaceConocido } from "./marketplacesConocidos";
import { ETIQUETAS_POR_ASIN } from "./etiquetas";
import { costeTotal, obtenerEscandallo, regionDeMarketplace } from "./escandallos";
import { tarifasDeSkus } from "./tarifasVenta";
import { obtenerGastos } from "./gastos";
import { adminDb } from "@/lib/firebase/admin";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * Amazon Vine: the units given to reviewers and what they cost. Amazon doesn't flag Vine orders: they're the
 * orders whose item came with a 100 % discount (price 0), with a normal order id (replacements start with «S0»).
 * Each unit costs Amazon's fees (real once the order is settled; until then the FBA fee of a real sale there)
 * plus the product's cost; the enrollment fees come from the account charges. All in memory: no extra reads.
 */

export type PedidoVine = {
  orderId: string;
  dia: string;
  marketplaceId: string;
  pais: string;
  codigoPais: string;
  asin: string;
  sku: string;
  titulo: string;
  etiqueta: string | null;
  unidades: number;
  estado: string;
  /** Amazon's fees (euros), real or estimated. */
  tarifas: number;
  tarifasEstimadas: boolean;
  /** Product cost (euros), or null without a cost breakdown. */
  coste: number | null;
};
export type CuotaVine = { fecha: string | null; mes: string; region: "eu" | "uk"; importe: number; moneda: string; eur: number };

export async function datosVine(): Promise<{ pedidos: PedidoVine[]; cuotas: CuotaVine[] }> {
  await asegurarAlmacen(await idUltimaSync());
  const lineas = [...pedidosEnAlmacen().values()].filter((p) => p.ventaTotal === 0 && p.unidades > 0 && p.estado !== "CANCELLED" && !p.amazonOrderId.startsWith("S0"));

  const costes = new Map<string, number | null>();
  const muestras = new Map<string, Awaited<ReturnType<typeof tarifasDeSkus>>>();
  const pedidos: PedidoVine[] = [];
  for (const p of lineas) {
    const region = regionDeMarketplace(p.marketplaceId);
    const kc = `${p.asin}|${region}`;
    if (!costes.has(kc)) {
      const e = await obtenerEscandallo(p.asin, region);
      const c = costeTotal(e);
      costes.set(kc, e.actualizadoEn && c > 0 ? c : null);
    }
    if (!muestras.has(p.sku)) muestras.set(p.sku, await tarifasDeSkus([p.sku]));
    // Not settled yet: a free unit pays the FBA fee (and any fixed fee) of a real sale of that SKU there.
    const m = muestras.get(p.sku)?.[p.marketplaceId];
    const estimada = m ? (m.fba + m.otras) * (m.moneda === p.moneda && p.tipoCambio > 0 ? p.tipoCambio : 1) * p.unidades : 0;
    const unitario = costes.get(kc) ?? null;
    const mk = marketplaceConocido(p.marketplaceId);
    pedidos.push({
      orderId: p.amazonOrderId,
      dia: diaMadrid(p.fecha),
      marketplaceId: p.marketplaceId,
      pais: mk?.pais ?? p.pais,
      codigoPais: mk?.codigoPais ?? "",
      asin: p.asin,
      sku: p.sku,
      titulo: p.titulo,
      etiqueta: ETIQUETAS_POR_ASIN[p.asin] ?? null,
      unidades: p.unidades,
      estado: p.estado,
      tarifas: Math.round((p.liquidado ? p.comisionesAmazon : estimada) * 100) / 100,
      tarifasEstimadas: !p.liquidado,
      coste: p.costeProducto ?? (unitario !== null ? Math.round(unitario * p.unidades * 100) / 100 : null),
    });
  }
  pedidos.sort((a, b) => b.dia.localeCompare(a.dia) || a.pais.localeCompare(b.pais, "es"));

  const cuotas = (await obtenerGastos()).lineas
    .filter((l) => l.categoria === "vine")
    .map((l) => ({ fecha: l.fecha, mes: l.mes, region: l.region, importe: l.importe, moneda: l.moneda, eur: l.eur }))
    .sort((a, b) => (b.fecha ?? b.mes).localeCompare(a.fecha ?? a.mes));
  return { pedidos, cuotas };
}

// ---------- Enrollments (typed in by hand: the API doesn't give Vine's enrollments or reviews) ----------

export type EstadoVine = "Activo" | "Finalizado" | "Pausado" | "Interrumpido";
export const ESTADOS_VINE: EstadoVine[] = ["Activo", "Finalizado", "Pausado", "Interrumpido"];
export type InscripcionVine = {
  id: string;
  asin: string;
  nombre: string;
  estado: EstadoVine;
  /** "YYYY-MM-DD" */
  fechaInscripcion: string | null;
  /** Launch date of the product's page ("YYYY-MM-DD"). */
  fechaLanzamiento: string | null;
  disponible: number;
  registrado: number;
  reclamado: number;
  resenas: number;
};
type DocInscripciones = { porMercado: Record<string, InscripcionVine[]> };

/** Seller Central's Vine page for amazon.es, as it was when this section was made. */
const INICIALES: DocInscripciones = {
  porMercado: {
    A1RKKUPIHCS9HS: [
      { id: "i1", asin: "B0H2SPYHLR", nombre: "Alfombra Entrenamiento Futbol con App – Kit Completo con App para Todas Las Edades", estado: "Finalizado", fechaInscripcion: "2026-06-30", fechaLanzamiento: "2026-01-06", disponible: 0, registrado: 30, reclamado: 17, resenas: 15 },
      { id: "i2", asin: "B0FMPLCLQ9", nombre: "Alfombra Entrenamiento Futbol – Incluye App de Entrenamiento con Videos", estado: "Finalizado", fechaInscripcion: "2025-08-30", fechaLanzamiento: "2025-08-16", disponible: 0, registrado: 10, reclamado: 7, resenas: 6 },
      { id: "i3", asin: "B0DMT3NR6X", nombre: "FITTLLINE Alfombra de Entrenamiento de Fútbol Con App - Tapete Profesional", estado: "Finalizado", fechaInscripcion: "2025-04-14", fechaLanzamiento: "2024-11-12", disponible: 0, registrado: 10, reclamado: 8, resenas: 8 },
    ],
  },
};

const gi = globalThis as unknown as { __vineInscripciones?: DocInscripciones };
const refInscripciones = () => adminDb().collection("config").doc("vine");

export async function inscripcionesVine(): Promise<DocInscripciones> {
  if (gi.__vineInscripciones) return gi.__vineInscripciones;
  const snap = await refInscripciones().get();
  contarLecturas(1);
  gi.__vineInscripciones = snap.exists ? { porMercado: (snap.get("porMercado") as DocInscripciones["porMercado"] | undefined) ?? {} } : INICIALES;
  return gi.__vineInscripciones;
}

const entero = (v: unknown) => Math.max(0, Math.min(1_000_000, Math.round(Number(v) || 0)));
const fechaValida = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const textoCorto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Replaces one marketplace's enrollments with these (checked and cleaned). */
export async function guardarInscripcionesVine(marketplaceId: string, filas: unknown): Promise<InscripcionVine[]> {
  if (!marketplaceConocido(marketplaceId)) throw new Error("País no válido");
  if (!Array.isArray(filas) || filas.length > 100) throw new Error("Datos no válidos");
  const limpias: InscripcionVine[] = filas.map((f: Record<string, unknown>, i) => {
    const asin = textoCorto(f.asin, 10).toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin)) throw new Error(`Fila ${i + 1}: el ASIN debe tener 10 letras o números`);
    return {
      id: textoCorto(f.id, 40) || `i${Date.now()}${i}`,
      asin,
      nombre: textoCorto(f.nombre, 200) || asin,
      estado: ESTADOS_VINE.includes(f.estado as EstadoVine) ? (f.estado as EstadoVine) : "Activo",
      fechaInscripcion: fechaValida(f.fechaInscripcion),
      fechaLanzamiento: fechaValida(f.fechaLanzamiento),
      disponible: entero(f.disponible),
      registrado: entero(f.registrado),
      reclamado: entero(f.reclamado),
      resenas: entero(f.resenas),
    };
  });
  const actual = await inscripcionesVine();
  const nuevo: DocInscripciones = { porMercado: { ...actual.porMercado, [marketplaceId]: limpias } };
  await refInscripciones().set({ ...nuevo, actualizadoEn: new Date().toISOString() });
  contarEscrituras(1);
  gi.__vineInscripciones = nuevo;
  return limpias;
}
