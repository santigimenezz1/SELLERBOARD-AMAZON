import "server-only";

import { datosVentas } from "./almacen";
import { cargarMarketplaces, cargarUltimaSync } from "./panel";
import { ETIQUETAS_POR_ASIN } from "./etiquetas";

/*
 * Data for the «Tendencias» page: every non-cancelled order line reduced to
 * when it was bought, where, which listing and how many units. The page
 * groups them by hour and weekday in the buyer's local time. Built from the
 * in-memory orders (no extra Firestore reads).
 */

/** t: purchase time (ms); mk: marketplace id; asin; u: units. */
export type VentaHora = { t: number; mk: string; asin: string; u: number };
export type OpcionListing = { asin: string; nombre: string };
export type OpcionPais = { id: string; pais: string; codigoPais: string; zona: string };

// Buyers' time zone per country: the UK is an hour behind; the other EU stores sell to Central European time.
const ZONA_POR_PAIS: Record<string, string> = { GB: "Europe/London", IE: "Europe/Dublin", PT: "Europe/Lisbon" };

/**
 * Start of the analysed history: 1 January 2026 (Madrid). Christmas sells differently and will get its own
 * analysis, so the season before it stays out of these trends.
 */
export const INICIO_TENDENCIAS = Date.UTC(2025, 11, 31, 23);

export async function datosTendencias() {
  const [ultima, marketplaces] = await Promise.all([cargarUltimaSync(), cargarMarketplaces()]);
  const { lineas } = await datosVentas(ultima?.id ?? null);
  const ventas: VentaHora[] = lineas
    .filter((l) => l.estado !== "CANCELLED" && l.unidades > 0 && l.fecha.getTime() >= INICIO_TENDENCIAS)
    .map((l) => ({ t: l.fecha.getTime(), mk: l.marketplaceId, asin: l.asin, u: l.unidades }));

  // Listings with sales, the labelled ones first (LISTING VIEJO / NUEVO), then by units sold.
  const porAsin = new Map<string, { nombre: string; u: number }>();
  for (const l of lineas) {
    if (l.estado === "CANCELLED" || !l.asin || l.fecha.getTime() < INICIO_TENDENCIAS) continue;
    const v = porAsin.get(l.asin) ?? { nombre: ETIQUETAS_POR_ASIN[l.asin] ?? (l.titulo.trim().length > 1 ? l.titulo.slice(0, 40) : l.asin), u: 0 };
    v.u += l.unidades;
    porAsin.set(l.asin, v);
  }
  const listings: OpcionListing[] = [...porAsin.entries()]
    .sort((a, b) => Number(!!ETIQUETAS_POR_ASIN[b[0]]) - Number(!!ETIQUETAS_POR_ASIN[a[0]]) || b[1].u - a[1].u)
    .map(([asin, v]) => ({ asin, nombre: v.nombre }));

  const conVentas = new Set(ventas.map((v) => v.mk));
  const paises: OpcionPais[] = marketplaces
    .filter((m) => conVentas.has(m.id))
    .map((m) => ({ id: m.id, pais: m.pais, codigoPais: m.codigoPais, zona: ZONA_POR_PAIS[m.codigoPais] ?? "Europe/Madrid" }));

  const primera = ventas.reduce((min, v) => Math.min(min, v.t), Infinity);
  return { ventas, listings, paises, generadoEn: Date.now(), desde: Number.isFinite(primera) ? primera : null };
}
export type DatosTendencias = Awaited<ReturnType<typeof datosTendencias>>;
