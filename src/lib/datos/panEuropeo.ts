import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { estadoPanEuropeo } from "@/lib/amazon/apis";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * Pan-European FBA status of each SKU (Amazon's Pan-EU report). One doc, `config/panEuropeo`, kept in memory;
 * the complete sync refreshes it at most twice a day (it hardly ever changes).
 */

type Doc = { porSku: Record<string, { asin: string; estado: string }>; actualizadoEn: string | null };
const REFRESCO_MS = 12 * 3600_000;
const ES = "A1RKKUPIHCS9HS";

const g = globalThis as unknown as { __panEuropeo?: Doc };
const ref = () => adminDb().collection("config").doc("panEuropeo");

async function leer(): Promise<Doc> {
  if (g.__panEuropeo) return g.__panEuropeo;
  const snap = await ref().get();
  contarLecturas(1);
  g.__panEuropeo = { porSku: (snap.get("porSku") as Doc["porSku"] | undefined) ?? {}, actualizadoEn: (snap.get("actualizadoEn") as string | undefined) ?? null };
  return g.__panEuropeo;
}

/** Enrolled, including «enrollment ending soon» (still in the programme until it ends). */
const INSCRITO = /^(inscrito|enrolled)$|fin de inscripci[oó]n pr[oó]xim|enrol+ment end/i;

/**
 * Whether a listing is in Pan-European FBA: true when any of its SKUs is enrolled, false when none is, null
 * when the report doesn't know its SKUs (yet).
 */
export async function panEuropeoDe(skus: string[]): Promise<boolean | null> {
  const { porSku } = await leer();
  const estados = skus.map((s) => porSku[s]?.estado).filter((e): e is string => !!e);
  if (estados.length === 0) return null;
  return estados.some((e) => INSCRITO.test(e.trim()));
}

/** Sync stage: re-reads the report when the stored one is over 12 hours old. Returns writes done. */
export async function actualizarPanEuropeo(): Promise<number> {
  const doc = await leer();
  if (doc.actualizadoEn && Date.now() - new Date(doc.actualizadoEn).getTime() < REFRESCO_MS) return 0;
  const filas = await estadoPanEuropeo(ES);
  if (filas.length === 0) return 0;
  const nuevo: Doc = { porSku: Object.fromEntries(filas.map((f) => [f.sku, { asin: f.asin, estado: f.estado }])), actualizadoEn: new Date().toISOString() };
  await ref().set(nuevo);
  contarEscrituras(1);
  g.__panEuropeo = nuevo;
  return 1;
}
