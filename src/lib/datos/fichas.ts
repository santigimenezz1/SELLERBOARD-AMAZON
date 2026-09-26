import "server-only";

import { fichasCatalogo, preciosCompetitivos, preciosPropios, type ItemCatalogoCompleto } from "@/lib/amazon/apis";
import { Escritor, fichasEnAlmacen, pedidosEnAlmacen, productosEnAlmacen } from "./almacen";
import { obtenerStock } from "./stock";
import type { Marketplace } from "./tipos";

/*
 * Listing cards ("fichas"): what a buyer sees on each product page, per
 * marketplace, plus our current price and Buy Box. One doc per ASIN in
 * `fichas`, mirrored in memory like the other collections.
 *
 * Catalog data barely changes: refreshed once a day. Prices every 3 hours.
 * Both are fetched in batches of 20 ASINs per call and marketplace, and only
 * changed docs are written. The refresh times live in memory only (writing
 * them would make every doc "changed").
 */

export type FichaMercado = {
  titulo: string | null;
  marca: string | null;
  vinetas: string[];
  descripcion: string | null;
  /** Largest version of each image, MAIN first. */
  imagenes: string[];
  ranking: { titulo: string; posicion: number; enlace: string | null }[];
  detalles: { etiqueta: string; valor: string }[];
};

export type PrecioMercado = {
  precio: number | null;
  envio: number | null;
  moneda: string;
  /** FBA: shipped by Amazon (Prime). */
  fba: boolean;
  buyBox: { precio: number; nuestra: boolean } | null;
  ofertas: number | null;
};

export type Ficha = {
  asin: string;
  mercados: Record<string, FichaMercado>;
  precios: Record<string, PrecioMercado>;
  actualizadoEn?: Date;
};

const LOCALES: Record<string, string> = { ES: "es_ES", DE: "de_DE", FR: "fr_FR", IT: "it_IT", NL: "nl_NL", GB: "en_GB", BE: "fr_BE", IE: "en_GB", PL: "pl_PL", SE: "sv_SE" };
const CADA_CATALOGO_MS = 24 * 3600_000;
const CADA_PRECIOS_MS = 3 * 3600_000;

const g = globalThis as unknown as { __fichasRefresco?: { catalogo: number; precios: number } };
const refresco = () => (g.__fichasRefresco ??= { catalogo: 0, precios: 0 });

function trocear<T>(xs: T[], n: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < xs.length; i += n) res.push(xs.slice(i, i + n));
  return res;
}

// ---------- Catalog item → card ----------

type Valor = { value?: unknown; marketplace_id?: string; language_tag?: string };

function valores(item: ItemCatalogoCompleto, clave: string, marketplaceId: string): string[] {
  const lista = (item.attributes?.[clave] ?? []) as Valor[];
  const delMercado = lista.filter((v) => !v.marketplace_id || v.marketplace_id === marketplaceId);
  return delMercado.map((v) => (typeof v.value === "string" || typeof v.value === "number" ? String(v.value) : "")).filter(Boolean);
}

const aCm = (v?: { unit?: string; value?: number }) => (v?.value == null ? null : v.unit === "inches" ? v.value * 2.54 : v.unit === "millimeters" ? v.value / 10 : v.value);
const aKg = (v?: { unit?: string; value?: number }) => (v?.value == null ? null : v.unit === "pounds" ? v.value * 0.453592 : v.unit === "grams" ? v.value / 1000 : v.value);
const num = (n: number, d = 1) => n.toLocaleString("es-ES", { maximumFractionDigits: d });

const ORDEN_IMAGENES = ["MAIN", "PT01", "PT02", "PT03", "PT04", "PT05", "PT06", "PT07", "PT08"];

export function fichaDesdeCatalogo(item: ItemCatalogoCompleto, marketplaceId: string): FichaMercado {
  const resumen = item.summaries?.find((s) => s.marketplaceId === marketplaceId) ?? item.summaries?.[0];

  const imagenesMk = item.images?.find((i) => i.marketplaceId === marketplaceId)?.images ?? item.images?.[0]?.images ?? [];
  const mejor = new Map<string, { link: string; area: number }>();
  for (const im of imagenesMk) {
    const area = im.width * im.height;
    if ((mejor.get(im.variant)?.area ?? -1) < area) mejor.set(im.variant, { link: im.link, area });
  }
  const imagenes = [...mejor.entries()]
    .filter(([v]) => v !== "SWCH")
    .sort(([a], [b]) => (ORDEN_IMAGENES.indexOf(a) + 1 || 99) - (ORDEN_IMAGENES.indexOf(b) + 1 || 99))
    .map(([, v]) => v.link);

  const rangos = item.salesRanks?.find((r) => r.marketplaceId === marketplaceId);
  const ranking = [...(rangos?.displayGroupRanks ?? []), ...(rangos?.classificationRanks ?? [])].map((r) => ({ titulo: r.title, posicion: r.rank, enlace: r.link ?? null }));

  const dim = item.dimensions?.find((d) => d.marketplaceId === marketplaceId)?.item ?? item.dimensions?.[0]?.item;
  const [largo, ancho, alto] = [aCm(dim?.length), aCm(dim?.width), aCm(dim?.height)];
  const peso = aKg(dim?.weight);
  const detalles: FichaMercado["detalles"] = [];
  const añadir = (etiqueta: string, valor: string | null | undefined) => {
    if (valor) detalles.push({ etiqueta, valor });
  };
  añadir("Marca", resumen?.brand ?? valores(item, "brand", marketplaceId)[0]);
  añadir("Color", resumen?.color ?? valores(item, "color", marketplaceId)[0]);
  añadir("Material", valores(item, "material", marketplaceId).join(", "));
  añadir("Número de modelo", resumen?.modelNumber ?? valores(item, "model_number", marketplaceId)[0]);
  añadir("Número de artículos", valores(item, "number_of_items", marketplaceId)[0]);
  if (largo && ancho && alto) añadir("Dimensiones del producto", `${num(largo)} × ${num(ancho)} × ${num(alto)} cm`);
  if (peso) añadir("Peso del producto", peso < 1 ? `${num(peso * 1000, 0)} g` : `${num(peso, 2)} kg`);
  añadir("ASIN", item.asin);

  return {
    titulo: resumen?.itemName ?? valores(item, "item_name", marketplaceId)[0] ?? null,
    marca: resumen?.brand ?? null,
    vinetas: valores(item, "bullet_point", marketplaceId),
    descripcion: valores(item, "product_description", marketplaceId)[0] ?? null,
    imagenes,
    ranking,
    detalles,
  };
}

// ---------- Refresh ----------

/** Every ASIN we know of: sold, in FBA stock, or already carded. */
async function asinsConocidos(): Promise<string[]> {
  const asins = new Set<string>();
  for (const p of pedidosEnAlmacen().values()) if (p.asin) asins.add(p.asin);
  for (const a of (await obtenerStock())?.articulos ?? []) if (a.asin) asins.add(a.asin);
  for (const a of productosEnAlmacen().keys()) asins.add(a);
  for (const a of fichasEnAlmacen().keys()) asins.add(a);
  return [...asins].sort();
}

/**
 * Refreshes catalog cards (daily) and prices (every 3 h) for the marketplaces given — normally the ones with
 * sales. `forzar` skips the timers (the "Actualizar" button on a product page); `soloAsins` limits the ASINs.
 * Returns how many docs were written.
 */
export async function actualizarFichas(marketplaces: Marketplace[], opciones: { forzar?: boolean; soloAsins?: string[] } = {}): Promise<number> {
  const ahora = Date.now();
  const r = refresco();
  const tocaCatalogo = opciones.forzar || ahora - r.catalogo > CADA_CATALOGO_MS;
  const tocaPrecios = opciones.forzar || ahora - r.precios > CADA_PRECIOS_MS;
  if (!tocaCatalogo && !tocaPrecios) return 0;

  const asins = opciones.soloAsins ?? (await asinsConocidos());
  if (asins.length === 0) return 0;

  // Work on copies of the current cards, then write the ones that changed.
  const fichas = new Map<string, Ficha>(
    asins.map((a) => {
      const f = fichasEnAlmacen().get(a);
      return [a, { asin: a, mercados: { ...(f?.mercados ?? {}) }, precios: { ...(f?.precios ?? {}) } }];
    }),
  );

  for (const mk of marketplaces.filter((m) => m.codigoPais)) {
    for (const lote of trocear(asins, 20)) {
      if (tocaCatalogo) {
        for (const item of await fichasCatalogo(lote, mk.id, LOCALES[mk.codigoPais.toUpperCase()])) {
          const f = fichas.get(item.asin);
          if (f) f.mercados[mk.id] = fichaDesdeCatalogo(item, mk.id);
        }
      }
      if (tocaPrecios) {
        const [propios, competitivos] = [await preciosPropios(lote, mk.id), await preciosCompetitivos(lote, mk.id)];
        for (const asin of lote) {
          const oferta = propios.find((p) => p.ASIN === asin)?.Product?.Offers?.[0];
          const comp = competitivos.find((p) => p.ASIN === asin)?.Product?.CompetitivePricing;
          const f = fichas.get(asin)!;
          if (!oferta) {
            // No offer of ours in this marketplace (not listed, or inactive).
            delete f.precios[mk.id];
            continue;
          }
          const bb = comp?.CompetitivePrices?.find((c) => c.CompetitivePriceId === "1");
          f.precios[mk.id] = {
            precio: oferta.BuyingPrice?.ListingPrice?.Amount ?? null,
            envio: oferta.BuyingPrice?.Shipping?.Amount ?? null,
            moneda: oferta.BuyingPrice?.ListingPrice?.CurrencyCode ?? mk.moneda,
            fba: oferta.FulfillmentChannel === "AMAZON",
            buyBox: bb?.Price?.LandedPrice?.Amount != null ? { precio: bb.Price.LandedPrice.Amount, nuestra: !!bb.belongsToRequester } : null,
            ofertas: comp?.NumberOfOfferListings?.find((n) => n.condition === "New")?.Count ?? null,
          };
        }
      }
    }
  }

  const esc = new Escritor();
  for (const f of fichas.values()) {
    // Cards with nothing at all (unknown ASIN everywhere) aren't worth a doc.
    if (Object.keys(f.mercados).length === 0 && Object.keys(f.precios).length === 0) continue;
    esc.set("fichas", f.asin, { asin: f.asin, mercados: f.mercados, precios: f.precios, actualizadoEn: new Date() }, { reemplazar: true });
  }
  const n = esc.cantidad;
  await esc.confirmar();
  if (!opciones.soloAsins) {
    if (tocaCatalogo) r.catalogo = ahora;
    if (tocaPrecios) r.precios = ahora;
  }
  return n;
}
