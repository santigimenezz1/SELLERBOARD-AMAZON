import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { rendimientoVendedor } from "@/lib/amazon/apis";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * Account health per marketplace: account status, Account Health Rating and
 * policy compliance counts, from Amazon's seller performance report (one per
 * marketplace, ~20 s each, requested in parallel). One doc,
 * `config/estadoCuenta`, refreshed by the sync at most every few hours.
 */

const REFRESCO_MS = 12 * 3600_000;
const MINIMO_MS = 30 * 60_000;

/** Policy categories in Seller Central's order; the key is the report field. */
export const CATEGORIAS_POLITICAS = [
  { clave: "suspectedIntellectualPropertyViolations", texto: "Supuestas infracciones de la propiedad intelectual" },
  { clave: "receivedIntellectualPropertyComplaints", texto: "Reclamaciones sobre propiedad intelectual" },
  { clave: "productAuthenticityCustomerComplaints", texto: "Reclamaciones por autenticidad del producto" },
  { clave: "productConditionCustomerComplaints", texto: "Reclamaciones por estado del producto" },
  { clave: "seguridad", texto: "Problemas relativos a la seguridad de productos y alimentos" },
  { clave: "listingPolicyViolations", texto: "Incumplimiento de la política de publicación" },
  { clave: "restrictedProductPolicyViolations", texto: "Infracciones de la política de productos excluidos" },
  { clave: "customerProductReviewsPolicyViolations", texto: "Incumplimiento de la política sobre reseñas de productos" },
  { clave: "otherPolicyViolations", texto: "Otros incumplimientos de políticas" },
  { clave: "documentRequests", texto: "Solicitudes de documentación" },
] as const;
export type ClaveCategoria = (typeof CATEGORIAS_POLITICAS)[number]["clave"];

export type EstadoMercado = {
  marketplaceId: string;
  /** NORMAL, AT_RISK, DEACTIVATED… */
  estado: string | null;
  puntuacion: number | null;
  /** GREAT, GOOD, FAIR, AT_RISK, CRITICAL… */
  estadoPuntuacion: string | null;
  categorias: Record<ClaveCategoria, number>;
  avisos: number;
  desde: string | null;
  hasta: string | null;
};
type Doc = { porMercado: Record<string, EstadoMercado>; actualizadoEn: string | null };

const g = globalThis as unknown as { __estadoCuenta?: Doc };
const ref = () => adminDb().collection("config").doc("estadoCuenta");

export async function obtenerEstadoCuenta(): Promise<Doc> {
  if (g.__estadoCuenta) return g.__estadoCuenta;
  const snap = await ref().get();
  contarLecturas(1);
  g.__estadoCuenta = { porMercado: (snap.get("porMercado") as Doc["porMercado"] | undefined) ?? {}, actualizadoEn: (snap.get("actualizadoEn") as string | undefined) ?? null };
  return g.__estadoCuenta;
}

async function leerMercado(marketplaceId: string): Promise<EstadoMercado | null> {
  const r = await rendimientoVendedor(marketplaceId);
  const m = r?.performanceMetrics?.find((x) => x.marketplaceId === marketplaceId) ?? r?.performanceMetrics?.[0];
  if (!r || !m) return null;
  const n = (k: string) => Number((m[k] as { defectsCount?: number } | undefined)?.defectsCount) || 0;
  const categorias = Object.fromEntries(CATEGORIAS_POLITICAS.map((c) => [c.clave, c.clave === "seguridad" ? n("productSafetyCustomerComplaints") + n("foodAndProductSafetyIssues") : n(c.clave)])) as Record<ClaveCategoria, number>;
  const rango = (m.listingPolicyViolations as { reportingDateRange?: { reportingDateFrom?: string; reportingDateTo?: string } } | undefined)?.reportingDateRange;
  return {
    marketplaceId,
    estado: r.accountStatuses?.find((a) => a.marketplaceId === marketplaceId)?.status ?? null,
    puntuacion: m.accountHealthRating?.ahrScore ?? null,
    estadoPuntuacion: m.accountHealthRating?.ahrStatus ?? null,
    categorias,
    avisos: m.policyViolationWarnings?.warningsCount ?? 0,
    desde: rango?.reportingDateFrom ?? null,
    hasta: rango?.reportingDateTo ?? null,
  };
}

/**
 * Refreshes every marketplace (in parallel). A marketplace that fails keeps its previous data. Returns writes
 * done. Skipped when refreshed lately (`forzar` shortens "lately" to minutes: Amazon limits report requests).
 */
export async function actualizarEstadoCuenta(marketplaceIds: string[], forzar = false): Promise<{ escrituras: number; errores: string[] }> {
  const actual = await obtenerEstadoCuenta();
  const edad = actual.actualizadoEn ? Date.now() - new Date(actual.actualizadoEn).getTime() : Infinity;
  if (edad < (forzar ? MINIMO_MS : REFRESCO_MS) || marketplaceIds.length === 0) return { escrituras: 0, errores: [] };
  const resultados = await Promise.allSettled(marketplaceIds.map((mk, i) => new Promise((r) => setTimeout(r, i * 1500)).then(() => leerMercado(mk))));
  const porMercado = { ...actual.porMercado };
  const errores: string[] = [];
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) porMercado[marketplaceIds[i]] = r.value;
    else if (r.status === "rejected") errores.push(`${marketplaceIds[i]}: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
  });
  // Nothing came back: keep the old timestamp so the next sync tries again.
  if (errores.length === marketplaceIds.length) throw new Error(errores[0]);
  const doc: Doc = { porMercado, actualizadoEn: new Date().toISOString() };
  await ref().set(doc);
  contarEscrituras(1);
  g.__estadoCuenta = doc;
  return { escrituras: 1, errores };
}
