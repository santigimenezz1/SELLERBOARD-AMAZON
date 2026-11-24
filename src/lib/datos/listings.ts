import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { todosLosListings, type ListingAmazon } from "@/lib/amazon/apis";
import { sellerIdGuardado } from "./saludListings";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * Every listing of the account in every marketplace (SKU, ASIN, status), so «Productos» also shows the ones with no
 * sales and no FBA stock yet (new, out of stock), which neither orders nor the FBA inventory report.
 * One doc, `config/listings`, refreshed by the sync once a day and written only when something changed.
 */

export type { ListingAmazon };
type Doc = { lista: ListingAmazon[]; actualizadoEn: string | null };

const g = globalThis as unknown as { __listings?: Doc };
const ref = () => adminDb().collection("config").doc("listings");
const CADA_MS = 24 * 3600_000;

async function leer(): Promise<Doc> {
  if (g.__listings) return g.__listings;
  const snap = await ref().get();
  contarLecturas(1);
  g.__listings = { lista: (snap.get("lista") as ListingAmazon[] | undefined) ?? [], actualizadoEn: (snap.get("actualizadoEn") as string | undefined) ?? null };
  return g.__listings;
}

/** The account's listings, as last read from Amazon. */
export async function listingsPropios(): Promise<ListingAmazon[]> {
  return (await leer()).lista;
}

/**
 * Sync stage (at most once a day, or now with `forzar`): reads every listing in each marketplace. A marketplace that
 * fails is kept as it was. Returns writes done (0 or 1). Needs the seller id the listing-health stage finds.
 */
export async function actualizarListings(marketplaceIds: string[], forzar = false): Promise<number> {
  const actual = await leer();
  if (!forzar && actual.actualizadoEn && Date.now() - new Date(actual.actualizadoEn).getTime() < CADA_MS) return 0;
  const sellerId = await sellerIdGuardado();
  if (!sellerId || !marketplaceIds.length) return 0;
  const lista: ListingAmazon[] = [];
  const errores: string[] = [];
  for (const mk of marketplaceIds) {
    try {
      lista.push(...(await todosLosListings(sellerId, mk)));
    } catch (e) {
      errores.push(`${mk}: ${e instanceof Error ? e.message : String(e)}`);
      lista.push(...actual.lista.filter((l) => l.marketplaceId === mk));
    }
  }
  lista.sort((a, b) => a.marketplaceId.localeCompare(b.marketplaceId) || a.sku.localeCompare(b.sku));
  const doc: Doc = { lista, actualizadoEn: new Date().toISOString() };
  const cambio = JSON.stringify(lista) !== JSON.stringify(actual.lista);
  g.__listings = doc;
  // Unchanged: the new date stays in memory only (no write); after a restart it is read again once.
  if (cambio || !actual.actualizadoEn) {
    await ref().set(doc);
    contarEscrituras(1);
  }
  if (errores.length === marketplaceIds.length) throw new Error(errores[0]);
  return cambio || !actual.actualizadoEn ? 1 : 0;
}
