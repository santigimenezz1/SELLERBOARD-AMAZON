import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { rendimientoVendedor } from "@/lib/amazon/apis";
import { contarEscrituras, contarLecturas } from "./consumo";
import { avisarEstadoCuenta, avisarInfracciones, type CambioPuntuacion, type NuevaInfraccion } from "@/lib/telegram";

/*
 * Account health per marketplace: account status, Account Health Rating and
 * policy compliance counts, from Amazon's seller performance report (one per
 * marketplace, ~20 s each, requested in parallel). One doc,
 * `config/estadoCuenta`, refreshed by every complete sync, hourly (Amazon recomputes the rating about daily). A
 * Telegram notice goes out when a marketplace drops below 200 points or gets back above, and another (to its own
 * group) when a new policy infraction shows up while the account is still at 200+ points.
 */

// Just under an hour, so every hourly complete sync refreshes it.
const REFRESCO_MS = 55 * 60_000;
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

/** `fresco`: skip the in-memory copy (the stored doc may have been changed from outside this server). */
export async function obtenerEstadoCuenta(fresco = false): Promise<Doc> {
  if (g.__estadoCuenta && !fresco) return g.__estadoCuenta;
  const snap = await ref().get();
  contarLecturas(1);
  g.__estadoCuenta = { porMercado: (snap.get("porMercado") as Doc["porMercado"] | undefined) ?? {}, actualizadoEn: (snap.get("actualizadoEn") as string | undefined) ?? null };
  return g.__estadoCuenta;
}

/** Minimum score Seller Central shows as «Adecuado». */
export const PUNTUACION_ADECUADA = 200;

/** For the menu: "ok" when every country is at 200+ points, "mal" when any is below, null without data. */
export async function resumenEstadoCuenta(): Promise<"ok" | "mal" | null> {
  const puntuaciones = Object.values((await obtenerEstadoCuenta()).porMercado)
    .map((e) => e.puntuacion)
    .filter((p): p is number => p !== null);
  if (puntuaciones.length === 0) return null;
  return puntuaciones.every((p) => p >= PUNTUACION_ADECUADA) ? "ok" : "mal";
}

export async function leerMercado(marketplaceId: string): Promise<EstadoMercado | null> {
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
  const enMemoria = await obtenerEstadoCuenta();
  const edad = enMemoria.actualizadoEn ? Date.now() - new Date(enMemoria.actualizadoEn).getTime() : Infinity;
  if (edad < (forzar ? MINIMO_MS : REFRESCO_MS) || marketplaceIds.length === 0) return { escrituras: 0, errores: [] };
  // The notices compare against the stored doc as it is now (one read per hour): an infraction already
  // acknowledged there (stored as the starting point by hand) must not ring again.
  const actual = await obtenerEstadoCuenta(true);
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

  // Telegram notice when a marketplace crosses the 200-point line (a first reading only when it's already red).
  const cambios: CambioPuntuacion[] = [];
  for (const [id, e] of Object.entries(porMercado)) {
    const antes = actual.porMercado[id]?.puntuacion ?? null;
    const ahora = e.puntuacion;
    if (ahora === null || e === actual.porMercado[id]) continue;
    const eraRojo = antes !== null && antes < PUNTUACION_ADECUADA;
    const esRojo = ahora < PUNTUACION_ADECUADA;
    if (antes === null ? esRojo : eraRojo !== esRojo) cambios.push({ marketplaceId: id, antes, ahora });
  }
  if (cambios.length) await avisarEstadoCuenta(cambios).catch((e) => errores.push(`Aviso de Telegram: ${e instanceof Error ? e.message : e}`));

  const nuevas = infraccionesNuevas(actual.porMercado, porMercado);
  if (nuevas.length) await avisarInfracciones(nuevas).catch((e) => errores.push(`Aviso de infracción por Telegram: ${e instanceof Error ? e.message : e}`));
  return { escrituras: 1, errores };
}

/**
 * Marketplaces where a policy category (or the infraction warnings) went up since the previous reading while
 * the rating is still at 200+ points. Counts are rolling windows, so going down is not news; a marketplace
 * without a previous reading is not compared.
 */
export function infraccionesNuevas(antes: Record<string, EstadoMercado>, ahora: Record<string, EstadoMercado>): NuevaInfraccion[] {
  const res: NuevaInfraccion[] = [];
  for (const [id, e] of Object.entries(ahora)) {
    const previo = antes[id];
    if (!previo?.categorias || e === previo || e.puntuacion === null || e.puntuacion < PUNTUACION_ADECUADA) continue;
    const subidas: NuevaInfraccion["subidas"] = CATEGORIAS_POLITICAS.map((c) => ({ texto: c.texto, antes: previo.categorias[c.clave] ?? 0, ahora: e.categorias[c.clave] ?? 0 })).filter((s) => s.ahora > s.antes);
    if (e.avisos > (previo.avisos ?? 0)) subidas.push({ texto: "Avisos de infracción de políticas", antes: previo.avisos ?? 0, ahora: e.avisos });
    if (subidas.length) res.push({ marketplaceId: id, puntuacion: e.puntuacion, puntuacionAntes: previo.puntuacion, subidas });
  }
  return res;
}
