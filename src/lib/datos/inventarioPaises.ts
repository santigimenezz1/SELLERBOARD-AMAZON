import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { inventarioPorPais, type InventarioPais } from "@/lib/amazon/apis";
import { contarEscrituras, contarLecturas } from "./consumo";
import { marketplaceConocido } from "./marketplacesConocidos";
import type { LineaVenta } from "./ventas";

/*
 * Where the stock physically is: sellable units per SKU in each country's
 * warehouses (Amazon's inventory-by-country report). One doc,
 * `config/inventarioPaises`, kept in memory. The report takes ~20 s to build,
 * so the sync refreshes it at most every few hours; «Actualizar stock» forces it.
 */

const REFRESCO_MS = 3 * 3600_000;
/** Even when forced (button), not more often than this: Amazon limits how often a report can be requested. */
const MINIMO_MS = 30 * 60_000;

type Doc = { filas: InventarioPais[]; actualizadoEn: string | null };
const g = globalThis as unknown as { __inventarioPaises?: Doc };
const ref = () => adminDb().collection("config").doc("inventarioPaises");

export async function obtenerInventarioPaises(): Promise<Doc> {
  if (g.__inventarioPaises) return g.__inventarioPaises;
  const snap = await ref().get();
  contarLecturas(1);
  g.__inventarioPaises = { filas: (snap.get("filas") as InventarioPais[] | undefined) ?? [], actualizadoEn: (snap.get("actualizadoEn") as string | undefined) ?? null };
  return g.__inventarioPaises;
}

/**
 * Countries (ISO code) with sales in the last `dias` days, per ASIN: an empty warehouse where a listing
 * sells means cross-border FBA fees for it.
 */
export function paisesConVentas(lineas: LineaVenta[], dias = 90): Record<string, string[]> {
  const desde = new Date(Date.now() - dias * 86_400_000);
  const porAsin: Record<string, Set<string>> = {};
  for (const l of lineas) {
    const pais = marketplaceConocido(l.marketplaceId)?.codigoPais;
    if (l.fecha < desde || l.estado === "CANCELLED" || !pais || !l.asin) continue;
    (porAsin[l.asin] ??= new Set()).add(pais);
  }
  return Object.fromEntries(Object.entries(porAsin).map(([asin, p]) => [asin, [...p]]));
}

/** Returns writes done. Skipped when refreshed lately (`forzar` shortens "lately" from hours to minutes). */
export async function actualizarInventarioPaises(marketplaceId: string, forzar = false): Promise<number> {
  const actual = await obtenerInventarioPaises();
  const edad = actual.actualizadoEn ? Date.now() - new Date(actual.actualizadoEn).getTime() : Infinity;
  if (edad < (forzar ? MINIMO_MS : REFRESCO_MS)) return 0;
  const filas = (await inventarioPorPais(marketplaceId)).sort((a, b) => a.sku.localeCompare(b.sku) || a.pais.localeCompare(b.pais));
  const doc: Doc = { filas, actualizadoEn: new Date().toISOString() };
  g.__inventarioPaises = doc;
  // The refresh time is stored even when nothing moved, so the report isn't requested again for a while.
  await ref().set(doc);
  contarEscrituras(1);
  return 1;
}
