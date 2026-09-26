import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { inventarioFBA, type ResumenInventario } from "@/lib/amazon/apis";
import { contarEscrituras, contarLecturas } from "./consumo";
import { nombrePais } from "./paises";
import type { Marketplace } from "./tipos";

/*
 * FBA stock snapshot. Amazon keeps one stock pool per region (Pan-European
 * FBA: every EU marketplace shares one pool; the UK has its own), so every
 * known marketplace is asked and those returning identical stock are grouped
 * into one region.
 *
 * Stored as a single doc (`config/stock`), written only when something changed,
 * and kept in memory: opening the Stock page costs no reads once loaded.
 */

export type CantidadesStock = {
  total: number;
  vendible: number;
  reservado: number;
  /** In transit to Amazon: working + shipped + receiving. */
  enCamino: number;
  noVendible: number;
  investigando: number;
};

export type Region = {
  id: string;
  nombre: string;
  /** flag-icons code: "eu", "gb", "es"… */
  bandera: string;
  marketplaceIds: string[];
  paises: string[];
};

export type ArticuloStock = {
  sku: string;
  asin: string;
  nombre: string;
  porRegion: Record<string, CantidadesStock>;
};

export type Stock = { actualizadoEn: string; regiones: Region[]; articulos: ArticuloStock[] };

const g = globalThis as unknown as { __stock?: Stock | null };

const REF = () => adminDb().collection("config").doc("stock");

/** Latest snapshot (memory first; one read the first time per server process). */
export async function obtenerStock(): Promise<Stock | null> {
  if (g.__stock !== undefined) return g.__stock;
  const snap = await REF().get();
  contarLecturas(1);
  g.__stock = snap.exists ? (snap.data() as Stock) : null;
  return g.__stock;
}

function cantidades(i: ResumenInventario): CantidadesStock {
  const d = i.inventoryDetails ?? {};
  return {
    total: i.totalQuantity ?? 0,
    vendible: d.fulfillableQuantity ?? 0,
    reservado: d.reservedQuantity?.totalReservedQuantity ?? 0,
    enCamino: (d.inboundWorkingQuantity ?? 0) + (d.inboundShippedQuantity ?? 0) + (d.inboundReceivingQuantity ?? 0),
    noVendible: d.unfulfillableQuantity?.totalUnfulfillableQuantity ?? 0,
    investigando: d.researchingQuantity?.totalResearchingQuantity ?? 0,
  };
}

const PAISES_UE = new Set(["ES", "DE", "FR", "IT", "NL", "BE", "IE", "AT", "PT", "SE", "PL"]);

function nombrarRegion(mks: Marketplace[]): Pick<Region, "id" | "nombre" | "bandera"> {
  const codigos = mks.map((m) => m.codigoPais.toUpperCase());
  if (codigos.length > 1 && codigos.every((c) => PAISES_UE.has(c))) return { id: "EU", nombre: "Europa", bandera: "eu" };
  if (codigos.length === 1) return { id: codigos[0], nombre: codigos[0] === "GB" ? "Reino Unido" : nombrePais(codigos[0]), bandera: codigos[0].toLowerCase() };
  return { id: codigos.join("-"), nombre: codigos.map(nombrePais).join(", "), bandera: "" };
}

/**
 * Asks Amazon for the stock of every marketplace, groups identical pools into regions and saves the snapshot
 * (one write, only if it changed). Returns the new snapshot.
 */
export async function actualizarStock(marketplaces: Marketplace[]): Promise<Stock> {
  const porMarketplace: { mk: Marketplace; items: ResumenInventario[]; firma: string }[] = [];
  for (const mk of marketplaces.filter((m) => m.codigoPais)) {
    const items = await inventarioFBA(mk.id);
    // Same SKUs with the same quantities = the same physical pool.
    const firma = JSON.stringify(items.map((i) => [i.sellerSku, cantidades(i)]).sort());
    porMarketplace.push({ mk, items, firma });
  }

  const grupos = new Map<string, typeof porMarketplace>();
  for (const x of porMarketplace) grupos.set(x.firma, [...(grupos.get(x.firma) ?? []), x]);

  const regiones: Region[] = [];
  const articulos = new Map<string, ArticuloStock>();
  for (const grupo of grupos.values()) {
    const mks = grupo.map((x) => x.mk);
    const region: Region = { ...nombrarRegion(mks), marketplaceIds: mks.map((m) => m.id), paises: mks.map((m) => m.codigoPais.toUpperCase()) };
    regiones.push(region);
    for (const i of grupo[0].items) {
      const sku = i.sellerSku ?? "";
      const a = articulos.get(sku) ?? { sku, asin: i.asin ?? "", nombre: i.productName ?? "", porRegion: {} };
      a.porRegion[region.id] = cantidades(i);
      if (!a.nombre && i.productName) a.nombre = i.productName;
      articulos.set(sku, a);
    }
  }
  // Biggest region first (Europe before the UK).
  regiones.sort((a, b) => b.marketplaceIds.length - a.marketplaceIds.length);

  const nuevo: Stock = { actualizadoEn: new Date().toISOString(), regiones, articulos: [...articulos.values()].sort((a, b) => a.sku.localeCompare(b.sku)) };
  const anterior = await obtenerStock();
  const igual = anterior && JSON.stringify({ ...anterior, actualizadoEn: "" }) === JSON.stringify({ ...nuevo, actualizadoEn: "" });
  if (igual) {
    // Nothing changed: no write. The in-memory time still moves, so the page shows the check was done.
    g.__stock = { ...anterior, actualizadoEn: nuevo.actualizadoEn };
    return g.__stock;
  }
  await REF().set(nuevo);
  contarEscrituras(1);
  g.__stock = nuevo;
  return nuevo;
}
