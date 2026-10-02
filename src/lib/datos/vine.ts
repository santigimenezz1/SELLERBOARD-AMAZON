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
import type { Pedido } from "./tipos";
import { avisarVine, type ReclamoVine } from "@/lib/telegram";

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

// ---------- Claims notice (every sync) ----------

/**
 * A Vine unit: an order line with a 100 % discount (price 0). Pending lines are left out: before Amazon
 * prices an order, a normal one without list price would also read 0.
 */
const esLineaVine = (p: Pedido) => p.ventaTotal === 0 && p.unidades > 0 && p.estado !== "CANCELLED" && !/PENDING/i.test(p.estado) && !p.amazonOrderId.startsWith("S0");

type DocAvisos = { avisados: string[] };
const ga = globalThis as unknown as { __vineAvisos?: DocAvisos };
const refAvisos = () => adminDb().collection("config").doc("vineAvisos");

/**
 * The enrollment a claim belongs to: in its marketplace, the latest one enrolled on or before the claim's day
 * (Vine orders don't say which enrollment they come from).
 */
function inscripcionDe(lista: InscripcionVine[] | undefined, dia: string): InscripcionVine | null {
  return (lista ?? []).filter((f) => f.fechaInscripcion && f.fechaInscripcion <= dia).sort((a, b) => b.fechaInscripcion!.localeCompare(a.fechaInscripcion!))[0] ?? null;
}

/**
 * Sync stage: Vine units the app hadn't notified yet (an order becomes a Vine one when Amazon prices it at 0,
 * minutes or hours after it was placed) → one Telegram notice per marketplace to the «Vine» group, and the
 * «Reclamado» of the matching enrollment in the Vine table raised to the units seen (never lowered: older
 * claims may predate the app's order history). The first run only records what is there. Returns writes done.
 */
export async function avisarReclamosVine(): Promise<number> {
  const lineas = [...pedidosEnAlmacen().values()].filter(esLineaVine);
  if (!ga.__vineAvisos) {
    const snap = await refAvisos().get();
    contarLecturas(1);
    ga.__vineAvisos = snap.exists ? { avisados: (snap.get("avisados") as string[] | undefined) ?? [] } : undefined;
  }
  let escrituras = 0;
  if (!ga.__vineAvisos) {
    ga.__vineAvisos = { avisados: lineas.map((p) => p.id) };
    await refAvisos().set({ ...ga.__vineAvisos, actualizadoEn: new Date().toISOString() });
    contarEscrituras(1);
    return 1;
  }
  const avisados = new Set(ga.__vineAvisos.avisados);
  const nuevas = lineas.filter((p) => !avisados.has(p.id));

  // «Reclamado» in the table: units per enrollment, never below what was typed in.
  const inscripciones = await inscripcionesVine();
  const porInscripcion = new Map<string, number>();
  for (const p of lineas) {
    const f = inscripcionDe(inscripciones.porMercado[p.marketplaceId], diaMadrid(p.fecha));
    if (f) porInscripcion.set(f.id, (porInscripcion.get(f.id) ?? 0) + p.unidades);
  }
  let tablaCambiada = false;
  const porMercado = Object.fromEntries(
    Object.entries(inscripciones.porMercado).map(([mk, lista]) => [
      mk,
      lista.map((f) => {
        const vistos = porInscripcion.get(f.id) ?? 0;
        if (vistos <= f.reclamado) return f;
        tablaCambiada = true;
        return { ...f, reclamado: vistos };
      }),
    ]),
  );
  if (tablaCambiada) {
    await refInscripciones().set({ porMercado, actualizadoEn: new Date().toISOString() });
    contarEscrituras(1);
    gi.__vineInscripciones = { porMercado };
    escrituras++;
  }
  if (nuevas.length === 0) return escrituras;

  // Recorded before notifying, so a Telegram failure never makes the same claim ring twice.
  ga.__vineAvisos = { avisados: [...avisados, ...nuevas.map((p) => p.id)] };
  await refAvisos().set({ ...ga.__vineAvisos, actualizadoEn: new Date().toISOString() });
  contarEscrituras(1);
  escrituras++;

  const reclamos: ReclamoVine[] = [];
  for (const mk of new Set(nuevas.map((p) => p.marketplaceId))) {
    const delMercado = nuevas.filter((p) => p.marketplaceId === mk);
    const unidades = delMercado.reduce((s, p) => s + p.unidades, 0);
    const ultima = delMercado.at(-1)!;
    const f = inscripcionDe(porMercado[mk], diaMadrid(ultima.fecha));
    // With an enrollment in the table its «Reclamado»; otherwise all the Vine units seen in that marketplace.
    const ahora = f ? f.reclamado : lineas.filter((p) => p.marketplaceId === mk).reduce((s, p) => s + p.unidades, 0);
    const producto = [...new Set(delMercado.map((p) => ETIQUETAS_POR_ASIN[p.asin] ?? (p.titulo.slice(0, 40) || p.sku)))].join(" + ");
    reclamos.push({ marketplaceId: mk, producto, unidades, antes: Math.max(0, ahora - unidades), ahora, registradas: f?.registrado ?? null });
  }
  await avisarVine(reclamos);
  return escrituras;
}
