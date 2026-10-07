import "server-only";

import { gunzipSync } from "node:zlib";
import { ErrorAmazon, spGet, spPost } from "./cliente";

/*
 * The SP-API operations this app uses, typed with only the fields we read.
 *
 * - Sellers API v1        getMarketplaceParticipations
 * - Orders API 2026-01-01 searchOrders (replaces Orders v0, removed 27/03/2027;
 *   it returns the order items inline, so no per-order getOrderItems calls)
 * - Finances v0           listFinancialEvents. The 2024-06-19 version answers 403 for this
 *   account; v0 is removed on 27/08/2027, so migrate before then.
 * - Catalog Items 2022-04-01 searchCatalogItems (listing photo)
 */

// ---------- Sellers ----------

type Participacion = {
  marketplace: { id: string; name: string; countryCode: string; defaultCurrencyCode: string; domainName?: string };
  participation: { isParticipating: boolean; hasSuspendedListings: boolean };
};

export async function marketplacesActivos() {
  const res = await spGet<{ payload?: Participacion[] }>("/sellers/v1/marketplaceParticipations");
  return (res.payload ?? []).filter(
    // Unified EU accounts also list non-Amazon sales channels (no amazon.* domain): skip those.
    (p) => p.participation.isParticipating && p.marketplace.domainName?.toLowerCase().includes("amazon."),
  );
}

// ---------- Orders ----------

export type Dinero = { amount: string | number; currencyCode: string };

export type PedidoAmazon = {
  orderId: string;
  createdTime: string;
  lastUpdatedTime: string;
  salesChannel: { marketplaceId?: string; marketplaceName?: string };
  fulfillment?: { fulfillmentStatus?: string };
  orderItems: {
    orderItemId: string;
    quantityOrdered: number;
    product?: { asin?: string; title?: string; sellerSku?: string; price?: { unitPrice?: Dinero } };
    proceeds?: { proceedsTotal?: Dinero; breakdowns?: { type: string; subtotal: Dinero }[] };
  }[];
};

/**
 * Orders updated in [desde, hasta] across the given marketplaces, following every page. With `porCompra`,
 * orders bought in that range instead (for importing older history): Amazon then allows a short burst of
 * pages and about one a minute after it, so a throttled page is waited for and retried rather than failing.
 */
export async function pedidosActualizados(desde: Date, hasta: Date, marketplaceIds: string[], porCompra = false): Promise<PedidoAmazon[]> {
  const pedidos: PedidoAmazon[] = [];
  let paginationToken: string | undefined;
  let esperas = 0;
  for (;;) {
    let res: { orders?: PedidoAmazon[]; pagination?: { nextToken?: string } };
    try {
      res = await spGet("/orders/2026-01-01/orders", {
        ...(porCompra ? { createdAfter: desde.toISOString(), createdBefore: hasta.toISOString() } : { lastUpdatedAfter: desde.toISOString(), lastUpdatedBefore: hasta.toISOString() }),
        // Empty list = every marketplace the account sells in.
        marketplaceIds: marketplaceIds.length ? marketplaceIds.slice(0, 50) : undefined,
        includedData: ["PROCEEDS", "FULFILLMENT"],
        maxResultsPerPage: 100,
        paginationToken,
      });
    } catch (e) {
      if (!porCompra || !(e instanceof ErrorAmazon) || e.status !== 429 || ++esperas > 60) throw e;
      await new Promise((r) => setTimeout(r, 65_000));
      continue;
    }
    pedidos.push(...(res.orders ?? []));
    paginationToken = res.pagination?.nextToken || undefined;
    if (!paginationToken) return pedidos;
  }
}

// ---------- Finances v0 ----------

export type Importe = { CurrencyCode: string; CurrencyAmount: number };
export type Componente = { ChargeType?: string; FeeType?: string; PromotionType?: string; ChargeAmount?: Importe; FeeAmount?: Importe; PromotionAmount?: Importe };

export type ItemEvento = {
  SellerSKU?: string;
  OrderItemId?: string;
  OrderAdjustmentItemId?: string;
  QuantityShipped?: number;
  ItemChargeList?: Componente[];
  ItemChargeAdjustmentList?: Componente[];
  ItemFeeList?: Componente[];
  ItemFeeAdjustmentList?: Componente[];
  PromotionList?: Componente[];
  PromotionAdjustmentList?: Componente[];
  /** Marketplace-facilitator VAT Amazon collects and pays itself. */
  ItemTaxWithheldList?: { TaxesWithheld?: Componente[] }[];
};

/** Shape shared by shipment, refund, guarantee-claim and chargeback events. */
export type EventoPedido = {
  AmazonOrderId?: string;
  MarketplaceName?: string;
  PostedDate?: string;
  ShipmentItemList?: ItemEvento[];
  ShipmentItemAdjustmentList?: ItemEvento[];
};

/** Account-level fee (storage, subscription…). Inbound freight charges carry the shipment id (FBA15…) as AmazonOrderId. */
export type EventoServicio = { AmazonOrderId?: string; FeeReason?: string; FeeDescription?: string; FeeList?: Componente[] };

export type EventosFinancieros = {
  ShipmentEventList: EventoPedido[];
  RefundEventList: EventoPedido[];
  GuaranteeClaimEventList: EventoPedido[];
  ChargebackEventList: EventoPedido[];
  ServiceFeeEventList: EventoServicio[];
  /** Sponsored-ads charges deducted from the account balance. */
  ProductAdsPaymentEventList: { postedDate?: string; transactionType?: string; transactionValue?: Importe }[];
  /** Account adjustments: reimbursements for lost/damaged units, clawbacks, reserves… */
  AdjustmentEventList: { AdjustmentType?: string; PostedDate?: string; AdjustmentAmount?: Importe }[];
};

/** Order-linked financial events posted in [desde, hasta). Empty if the window exceeds 180 days. */
export async function eventosFinancieros(desde: Date, hasta: Date): Promise<EventosFinancieros> {
  const res: EventosFinancieros = { ShipmentEventList: [], RefundEventList: [], GuaranteeClaimEventList: [], ChargebackEventList: [], ServiceFeeEventList: [], ProductAdsPaymentEventList: [], AdjustmentEventList: [] };
  let NextToken: string | undefined;
  do {
    const r = await spGet<{ payload?: { FinancialEvents?: Partial<EventosFinancieros>; NextToken?: string } }>("/finances/v0/financialEvents", {
      PostedAfter: desde.toISOString(),
      PostedBefore: hasta.toISOString(),
      MaxResultsPerPage: 100,
      NextToken,
    });
    const ev = r.payload?.FinancialEvents ?? {};
    for (const k of Object.keys(res) as (keyof EventosFinancieros)[]) res[k].push(...(ev[k] ?? []));
    NextToken = r.payload?.NextToken || undefined;
  } while (NextToken);
  return res;
}

export type GrupoFinanciero = {
  FinancialEventGroupId?: string;
  FinancialEventGroupStart?: string;
  /** "Open" while the settlement period is running, "Closed" once paid out. */
  ProcessingStatus?: string;
  FundTransferStatus?: string;
  FundTransferDate?: string;
  OriginalTotal?: Importe;
  ConvertedTotal?: Importe;
};

/** Settlement periods started after `desde`, each with the payout it ended in (amount, status, transfer date). */
export async function gruposFinancieros(desde: Date): Promise<GrupoFinanciero[]> {
  const res: GrupoFinanciero[] = [];
  let NextToken: string | undefined;
  do {
    const r = await spGet<{ payload?: { FinancialEventGroupList?: GrupoFinanciero[]; NextToken?: string } }>("/finances/v0/financialEventGroups", {
      FinancialEventGroupStartedAfter: desde.toISOString(),
      MaxResultsPerPage: 100,
      NextToken,
    });
    res.push(...(r.payload?.FinancialEventGroupList ?? []));
    NextToken = r.payload?.NextToken || undefined;
  } while (NextToken);
  return res;
}

/** Marketplace names ("Amazon.es"…) of the first page of events of a settlement period. */
export async function mercadosDeGrupo(grupoId: string): Promise<string[]> {
  const r = await spGet<{ payload?: { FinancialEvents?: Record<string, { MarketplaceName?: string }[] | undefined> } }>(
    `/finances/v0/financialEventGroups/${encodeURIComponent(grupoId)}/financialEvents`,
    { MaxResultsPerPage: 100 },
  );
  return Object.values(r.payload?.FinancialEvents ?? {})
    .flatMap((v) => (Array.isArray(v) ? v : []))
    .map((e) => e.MarketplaceName ?? "")
    .filter(Boolean);
}

/**
 * Money of a marketplace Amazon is still holding (sales not released yet: it waits some days after delivery),
 * in its currency. Finances 2024-06-19, DEFERRED transactions.
 */
export async function importeRetenido(marketplaceId: string, desde: Date): Promise<{ importe: number; moneda: string | null }> {
  let importe = 0;
  let moneda: string | null = null;
  let nextToken: string | undefined;
  do {
    const r = await spGet<{ payload?: { transactions?: { totalAmount?: { currencyAmount?: number; currencyCode?: string } }[]; nextToken?: string } }>("/finances/2024-06-19/transactions", {
      postedAfter: desde.toISOString(),
      marketplaceId,
      transactionStatus: "DEFERRED",
      nextToken,
    });
    for (const t of r.payload?.transactions ?? []) {
      importe += Number(t.totalAmount?.currencyAmount) || 0;
      moneda ??= t.totalAmount?.currencyCode ?? null;
    }
    nextToken = r.payload?.nextToken || undefined;
  } while (nextToken);
  return { importe, moneda };
}

// ---------- Catalog Items 2022-04-01 ----------

type ItemCatalogo = {
  asin: string;
  images?: { marketplaceId: string; images: { variant: string; link: string; height: number; width: number }[] }[];
  summaries?: { marketplaceId: string; itemName?: string }[];
};

/** Main listing image (and title) for up to 20 ASINs per call, as seen in one marketplace. */
export async function imagenesCatalogo(asins: string[], marketplaceId: string): Promise<{ asin: string; imagen: string | null; titulo: string | null }[]> {
  const res = await spGet<{ items?: ItemCatalogo[] }>("/catalog/2022-04-01/items", {
    identifiers: asins.slice(0, 20),
    identifiersType: "ASIN",
    marketplaceIds: marketplaceId,
    includedData: ["images", "summaries"],
    pageSize: 20,
  });
  return (res.items ?? []).map((item) => {
    const imagenes = item.images?.find((g) => g.marketplaceId === marketplaceId)?.images ?? item.images?.[0]?.images ?? [];
    // Several sizes of the MAIN image come back; the largest one is sharpest when scaled down.
    const principal = imagenes.filter((i) => i.variant === "MAIN").sort((a, b) => b.width - a.width)[0] ?? imagenes[0];
    return { asin: item.asin, imagen: principal?.link ?? null, titulo: item.summaries?.[0]?.itemName ?? null };
  });
}

export type MiembroFamilia = { asin: string; titulo: string | null; color: string | null; talla: string | null; imagen: string | null };
type ItemFamilia = Omit<ItemCatalogo, "summaries"> & {
  summaries?: { marketplaceId: string; itemName?: string; color?: string; size?: string }[];
  relationships?: { marketplaceId: string; relationships?: { type?: string; parentAsins?: string[]; childAsins?: string[]; variationTheme?: { attributes?: string[] } }[] }[];
};

async function itemsFamilia(asins: string[], marketplaceId: string): Promise<ItemFamilia[]> {
  if (!asins.length) return [];
  const res = await spGet<{ items?: ItemFamilia[] }>("/catalog/2022-04-01/items", {
    identifiers: asins.slice(0, 20),
    identifiersType: "ASIN",
    marketplaceIds: marketplaceId,
    includedData: ["relationships", "summaries", "images"],
    pageSize: 20,
  });
  return res.items ?? [];
}

const miembro = (it: ItemFamilia, marketplaceId: string): MiembroFamilia => {
  const s = it.summaries?.find((x) => x.marketplaceId === marketplaceId) ?? it.summaries?.[0];
  const imagenes = it.images?.find((g) => g.marketplaceId === marketplaceId)?.images ?? it.images?.[0]?.images ?? [];
  const principal = imagenes.filter((i) => i.variant === "MAIN").sort((a, b) => b.width - a.width)[0] ?? imagenes[0];
  return { asin: it.asin, titulo: s?.itemName ?? null, color: s?.color ?? null, talla: s?.size ?? null, imagen: principal?.link ?? null };
};

/**
 * A listing's variation family: its parent (null when it has no variations) and the children (colours, sizes…),
 * up to 20, plus the attributes the variations differ in (`tema`, e.g. ["color"]).
 */
export async function familiaCatalogo(asin: string, marketplaceId: string): Promise<{ listing: MiembroFamilia; variantes: MiembroFamilia[]; tema: string[] } | null> {
  const [item] = await itemsFamilia([asin], marketplaceId);
  if (!item) return null;
  const relaciones = (it: ItemFamilia) => it.relationships?.find((r) => r.marketplaceId === marketplaceId)?.relationships ?? it.relationships?.[0]?.relationships ?? [];
  const padreAsin = relaciones(item).find((r) => r.parentAsins?.length)?.parentAsins?.[0];
  const padre = padreAsin ? ((await itemsFamilia([padreAsin], marketplaceId))[0] ?? item) : item;
  const variacion = relaciones(padre).find((r) => r.childAsins?.length);
  const hijos = await itemsFamilia(variacion?.childAsins ?? [], marketplaceId);
  return { listing: miembro(padre, marketplaceId), variantes: hijos.map((h) => miembro(h, marketplaceId)), tema: variacion?.variationTheme?.attributes ?? [] };
}

// ---------- FBA Inventory v1 ----------

export type ResumenInventario = {
  asin?: string;
  fnSku?: string;
  sellerSku?: string;
  productName?: string;
  totalQuantity?: number;
  lastUpdatedTime?: string;
  inventoryDetails?: {
    fulfillableQuantity?: number;
    inboundWorkingQuantity?: number;
    inboundShippedQuantity?: number;
    inboundReceivingQuantity?: number;
    reservedQuantity?: { totalReservedQuantity?: number };
    unfulfillableQuantity?: { totalUnfulfillableQuantity?: number };
    researchingQuantity?: { totalResearchingQuantity?: number };
  };
};

/** FBA stock as seen from one marketplace (in Pan-European FBA every EU marketplace returns the same shared pool). */
export async function inventarioFBA(marketplaceId: string): Promise<ResumenInventario[]> {
  const todos: ResumenInventario[] = [];
  let nextToken: string | undefined;
  do {
    const r = await spGet<{ payload?: { inventorySummaries?: ResumenInventario[] }; pagination?: { nextToken?: string } }>("/fba/inventory/v1/summaries", {
      details: "true",
      granularityType: "Marketplace",
      granularityId: marketplaceId,
      marketplaceIds: marketplaceId,
      nextToken,
    });
    todos.push(...(r.payload?.inventorySummaries ?? []));
    nextToken = r.pagination?.nextToken || undefined;
  } while (nextToken);
  return todos;
}

// ---------- Catalog Items 2022-04-01: full listing card ----------

type ValorAtributo = { value?: unknown; language_tag?: string; marketplace_id?: string; unit?: string };
type Medida = { unit?: string; value?: number };

export type ItemCatalogoCompleto = {
  asin: string;
  attributes?: Record<string, (ValorAtributo & Record<string, unknown>)[]>;
  images?: { marketplaceId: string; images: { variant: string; link: string; height: number; width: number }[] }[];
  summaries?: { marketplaceId: string; itemName?: string; brand?: string; color?: string; size?: string; modelNumber?: string }[];
  salesRanks?: {
    marketplaceId: string;
    classificationRanks?: { title: string; link?: string; rank: number }[];
    displayGroupRanks?: { title: string; link?: string; rank: number }[];
  }[];
  dimensions?: { marketplaceId: string; item?: { height?: Medida; length?: Medida; width?: Medida; weight?: Medida } }[];
};

/** Everything a buyer sees on a listing, for up to 20 ASINs in one marketplace, in that marketplace's language. */
export async function fichasCatalogo(asins: string[], marketplaceId: string, locale?: string): Promise<ItemCatalogoCompleto[]> {
  const res = await spGet<{ items?: ItemCatalogoCompleto[] }>("/catalog/2022-04-01/items", {
    identifiers: asins.slice(0, 20),
    identifiersType: "ASIN",
    marketplaceIds: marketplaceId,
    includedData: ["attributes", "images", "summaries", "salesRanks", "dimensions"],
    locale,
    pageSize: 20,
  });
  return res.items ?? [];
}

// ---------- Product Pricing v0: own price and Buy Box, 20 ASINs per call ----------

type PrecioV0 = { Amount?: number; CurrencyCode?: string };

export type PrecioPropio = {
  ASIN: string;
  status: string;
  Product?: { Offers?: { SellerSKU?: string; FulfillmentChannel?: string; BuyingPrice?: { ListingPrice?: PrecioV0; Shipping?: PrecioV0; LandedPrice?: PrecioV0 } }[] };
};

export type PrecioCompetitivo = {
  ASIN: string;
  status: string;
  Product?: {
    CompetitivePricing?: {
      CompetitivePrices?: { CompetitivePriceId?: string; belongsToRequester?: boolean; Price?: { LandedPrice?: PrecioV0 } }[];
      NumberOfOfferListings?: { condition?: string; Count?: number }[];
    };
  };
};

/** The seller's own offer (price, shipping, channel) for up to 20 ASINs in one marketplace. */
export async function preciosPropios(asins: string[], marketplaceId: string): Promise<PrecioPropio[]> {
  const r = await spGet<{ payload?: PrecioPropio[] }>("/products/pricing/v0/price", { MarketplaceId: marketplaceId, ItemType: "Asin", Asins: asins.slice(0, 20) });
  return r.payload ?? [];
}

/** Buy Box price, whether it's ours, and the number of offers, for up to 20 ASINs in one marketplace. */
export async function preciosCompetitivos(asins: string[], marketplaceId: string): Promise<PrecioCompetitivo[]> {
  const r = await spGet<{ payload?: PrecioCompetitivo[] }>("/products/pricing/v0/competitivePrice", { MarketplaceId: marketplaceId, ItemType: "Asin", Asins: asins.slice(0, 20) });
  return r.payload ?? [];
}

// ---------- Competitors of a Helium 10 study (any ASIN, not only ours) ----------

type MedidaAmazon = { unit?: string; value?: number };
const A_CM: Record<string, number> = { inches: 2.54, centimeters: 1, millimeters: 0.1, meters: 100 };
const A_KG: Record<string, number> = { pounds: 0.45359237, kilograms: 1, grams: 0.001, ounces: 0.028349523 };
const cm = (m?: MedidaAmazon) => (m?.value && m.unit && A_CM[m.unit] ? Math.round(m.value * A_CM[m.unit] * 10) / 10 : null);
const kg = (m?: MedidaAmazon) => (m?.value && m.unit && A_KG[m.unit] ? Math.round(m.value * A_KG[m.unit] * 100) / 100 : null);

export type FichaCompetidorAmazon = {
  titulo: string | null;
  marca: string | null;
  /** Package as Amazon has it, in cm and kg (what the FBA fee depends on). */
  paquete: { largo: number; ancho: number; alto: number; peso: number } | null;
  rankings: { rank: number; categoria: string }[];
};

type ItemFicha = {
  asin: string;
  summaries?: { itemName?: string; brand?: string }[];
  dimensions?: { package?: { length?: MedidaAmazon; width?: MedidaAmazon; height?: MedidaAmazon; weight?: MedidaAmazon } }[];
  salesRanks?: { classificationRanks?: { title: string; rank: number }[]; displayGroupRanks?: { title: string; rank: number }[] }[];
};

function ficha(it: ItemFicha): FichaCompetidorAmazon {
  const s = it.summaries?.[0];
  const pq = it.dimensions?.[0]?.package;
  const medidas = [cm(pq?.length), cm(pq?.width), cm(pq?.height)];
  const peso = kg(pq?.weight);
  const r = it.salesRanks?.[0];
  return {
    titulo: s?.itemName ?? null,
    marca: s?.brand ?? null,
    paquete: medidas.every((x) => x !== null) && peso !== null ? { largo: medidas[0]!, ancho: medidas[1]!, alto: medidas[2]!, peso } : null,
    // The narrow category first (#2 in «Fußballtornetze»), then the big one.
    rankings: [...(r?.classificationRanks ?? []), ...(r?.displayGroupRanks ?? [])].map((x) => ({ rank: x.rank, categoria: x.title })),
  };
}

/** Catalog data (name, brand, package, sales ranks) of up to 20 ASINs in one marketplace; missing ones aren't returned. */
export async function fichasCompetidores(asins: string[], marketplaceId: string): Promise<Map<string, FichaCompetidorAmazon>> {
  const r = await spGet<{ items?: ItemFicha[] }>("/catalog/2022-04-01/items", {
    identifiers: asins.slice(0, 20),
    identifiersType: "ASIN",
    marketplaceIds: marketplaceId,
    includedData: ["summaries", "dimensions", "salesRanks"],
    pageSize: 20,
  });
  return new Map((r.items ?? []).map((it) => [it.asin, ficha(it)]));
}

export type OfertasAmazon = { precio: number | null; moneda: string | null; ofertas: number | null; destacadaFba: boolean | null };

/** Offers of any ASIN: the featured offer's price, how many sellers, and whether the featured one ships with Amazon. */
export async function ofertasCompetidor(asin: string, marketplaceId: string): Promise<OfertasAmazon> {
  type Precio = { Amount?: number; CurrencyCode?: string };
  const r = await spGet<{
    payload?: {
      Summary?: { TotalOfferCount?: number; BuyBoxPrices?: { LandedPrice?: Precio }[]; LowestPrices?: { LandedPrice?: Precio }[] };
      Offers?: { IsBuyBoxWinner?: boolean; IsFulfilledByAmazon?: boolean; ListingPrice?: Precio }[];
    };
  }>(`/products/pricing/v0/items/${encodeURIComponent(asin)}/offers`, { MarketplaceId: marketplaceId, ItemCondition: "New" });
  const p = r.payload;
  const destacada = p?.Offers?.filter((o) => o.IsBuyBoxWinner) ?? [];
  const precio = p?.Summary?.BuyBoxPrices?.[0]?.LandedPrice ?? p?.Summary?.LowestPrices?.[0]?.LandedPrice;
  return {
    precio: precio?.Amount ?? null,
    moneda: precio?.CurrencyCode ?? null,
    ofertas: p?.Summary?.TotalOfferCount ?? null,
    destacadaFba: destacada.length ? destacada.some((o) => o.IsFulfilledByAmazon) : null,
  };
}

/**
 * Featured-offer price and number of sellers of up to 20 ASINs at once (for the daily follow-up). ASINs Amazon
 * didn't answer for («ClientError») are left out; one without offers comes back with 0 sellers and no price.
 */
export async function preciosCompetidores(asins: string[], marketplaceId: string): Promise<Map<string, { precio: number | null; ofertas: number }>> {
  const r = await preciosCompetitivos(asins, marketplaceId);
  return new Map(
    r
      .filter((x) => x.status === "Success")
      .map((x) => {
        const c = x.Product?.CompetitivePricing;
        const destacada = c?.CompetitivePrices?.find((p) => p.CompetitivePriceId === "1") ?? c?.CompetitivePrices?.[0];
        const ofertas = c?.NumberOfOfferListings?.find((n) => /new/i.test(n.condition ?? ""))?.Count ?? c?.NumberOfOfferListings?.[0]?.Count ?? 0;
        return [x.ASIN, { precio: destacada?.Price?.LandedPrice?.Amount ?? null, ofertas }];
      }),
  );
}

export type TarifasAmazon = { comision: number; tarifaFba: number; total: number };

/**
 * Amazon's fee estimate for an ASIN sold with FBA at a price: referral fee and fulfilment fee, as the revenue
 * calculator shows them. Amazon answers «InternalError» at random to between one call in ten and one in three
 * (tested in October 2026, same with the batch endpoint): it's retried up to six times.
 */
export async function tarifasCompetidor(asin: string, marketplaceId: string, precio: number, moneda: string): Promise<TarifasAmazon> {
  type Resultado = {
    Status?: string;
    Error?: { Code?: string; Message?: string };
    FeesEstimate?: { TotalFeesEstimate?: { Amount?: number }; FeeDetailList?: { FeeType?: string; FinalFee?: { Amount?: number } }[] };
  };
  let ultimo = "";
  for (let intento = 0; intento < 6; intento++) {
    const r = await spPost<{ payload?: { FeesEstimateResult?: Resultado } }>(`/products/fees/v0/items/${encodeURIComponent(asin)}/feesEstimate`, {
      FeesEstimateRequest: {
        MarketplaceId: marketplaceId,
        IsAmazonFulfilled: true,
        PriceToEstimateFees: { ListingPrice: { CurrencyCode: moneda, Amount: precio }, Shipping: { CurrencyCode: moneda, Amount: 0 } },
        Identifier: `h10-${asin}-${Date.now()}`,
      },
    });
    const res = r.payload?.FeesEstimateResult;
    if (res?.Status === "Success" && res.FeesEstimate) {
      const tarifa = (tipo: string) => res.FeesEstimate!.FeeDetailList?.find((f) => f.FeeType === tipo)?.FinalFee?.Amount ?? 0;
      return { comision: tarifa("ReferralFee"), tarifaFba: tarifa("FBAFees"), total: res.FeesEstimate.TotalFeesEstimate?.Amount ?? 0 };
    }
    ultimo = res?.Error ? `${res.Error.Code}: ${res.Error.Message}` : "sin respuesta";
    // Only Amazon's own hiccups are worth retrying.
    if (res?.Error?.Code !== "InternalError") break;
    await new Promise((ok) => setTimeout(ok, 1500 * (intento + 1)));
  }
  throw new ErrorAmazon(`Tarifas de ${asin}: ${ultimo}`, 500);
}

// ---------- Reports 2021-06-30 ----------

async function descargarInforme(reportType: string, reportDocumentId: string): Promise<string> {
  const doc = await spGet<{ url: string; compressionAlgorithm?: string }>(`/reports/2021-06-30/documents/${reportDocumentId}`);
  const res = await fetch(doc.url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${reportType}: descarga HTTP ${res.status}`);
  let buf = Buffer.from(await res.arrayBuffer());
  if (doc.compressionAlgorithm === "GZIP") buf = gunzipSync(buf);
  return buf.toString("utf8");
}

/** Tab-separated flat file → rows of column → value. */
function filasPlanas(texto: string): Record<string, string>[] {
  const [cabecera, ...filas] = texto.split(/\r?\n/).filter(Boolean).map((l) => l.split("\t"));
  return filas.map((f) => Object.fromEntries((cabecera ?? []).map((c, i) => [c, f[i] ?? ""])));
}

/** Document id of the newest finished report of this type (and marketplaces) from the last 24 h, if any. */
async function ultimoInformeHecho(reportType: string, marketplaceIds: string[]): Promise<string | null> {
  const r = await spGet<{ reports?: { reportDocumentId?: string; createdTime: string; marketplaceIds?: string[] }[] }>("/reports/2021-06-30/reports", {
    reportTypes: reportType,
    processingStatuses: "DONE",
    marketplaceIds,
    createdSince: new Date(Date.now() - 24 * 3600_000).toISOString(),
    pageSize: 10,
  });
  const hechos = (r.reports ?? [])
    .filter((x) => x.reportDocumentId && (!x.marketplaceIds || marketplaceIds.every((m) => x.marketplaceIds!.includes(m))))
    .sort((a, b) => b.createdTime.localeCompare(a.createdTime));
  return hechos[0]?.reportDocumentId ?? null;
}

/**
 * Requests a report, waits until Amazon has built it (usually ~20 s) and returns its raw text; null when there
 * is no data for the period. Throws if it isn't ready within `esperaMaximaMs`. When Amazon refuses a new one
 * (asked again too soon), the latest one it already built for the same marketplaces is used instead.
 */
async function informe(reportType: string, marketplaceIds: string[], desde: Date | null, esperaMaximaMs = 120_000): Promise<string | null> {
  let reportId: string;
  try {
    ({ reportId } = await spPost<{ reportId: string }>("/reports/2021-06-30/reports", { reportType, marketplaceIds, ...(desde ? { dataStartTime: desde.toISOString() } : {}) }));
  } catch (e) {
    const previo = e instanceof ErrorAmazon && e.status === 429 ? await ultimoInformeHecho(reportType, marketplaceIds) : null;
    if (previo) return descargarInforme(reportType, previo);
    throw e;
  }
  const limite = Date.now() + esperaMaximaMs;
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const r = await spGet<{ processingStatus: string; reportDocumentId?: string }>(`/reports/2021-06-30/reports/${reportId}`);
    if (r.processingStatus === "DONE" && r.reportDocumentId) return descargarInforme(reportType, r.reportDocumentId);
    // No data in the period comes back as DONE_NO_DATA (or CANCELLED for some report types).
    if (r.processingStatus === "DONE_NO_DATA" || r.processingStatus === "CANCELLED") return null;
    if (r.processingStatus === "FATAL") {
      const previo = await ultimoInformeHecho(reportType, marketplaceIds);
      if (previo) return descargarInforme(reportType, previo);
      throw new Error(`${reportType}: Amazon no pudo generar el informe`);
    }
    if (Date.now() > limite) throw new Error(`${reportType}: el informe tarda demasiado, se reintentará en la próxima sincronización`);
  }
}

// ---------- Brand Analytics reports (weekly, per marketplace) ----------

/**
 * Asks for a Brand Analytics report of one marketplace and week. Amazon allows about one new report a minute
 * (after a small burst): when it says «too many», wait a minute and ask again.
 */
export async function pedirInformeMarca(reportType: string, marketplaceId: string, desde: string, hasta: string, reportOptions: Record<string, string>): Promise<string> {
  for (let intento = 0; ; intento++) {
    try {
      const { reportId } = await spPost<{ reportId: string }>("/reports/2021-06-30/reports", { reportType, marketplaceIds: [marketplaceId], dataStartTime: desde, dataEndTime: hasta, reportOptions });
      return reportId;
    } catch (e) {
      if (!(e instanceof ErrorAmazon && e.status === 429) || intento >= 15) throw e;
      await new Promise((r) => setTimeout(r, 65_000));
    }
  }
}

/** Waits for a report: its document id when done, null when Amazon has no data for it. */
export async function esperarInforme(reportId: string, esperaMaximaMs = 20 * 60_000): Promise<string | null> {
  const limite = Date.now() + esperaMaximaMs;
  for (;;) {
    await new Promise((r) => setTimeout(r, 15_000));
    const r = await spGet<{ processingStatus: string; reportDocumentId?: string; reportType?: string }>(`/reports/2021-06-30/reports/${reportId}`);
    if (r.processingStatus === "DONE" && r.reportDocumentId) return r.reportDocumentId;
    if (["DONE_NO_DATA", "CANCELLED", "FATAL"].includes(r.processingStatus)) return null;
    if (Date.now() > limite) throw new Error(`${r.reportType ?? reportId}: el informe tarda demasiado`);
  }
}

/** A small JSON report, parsed. */
export async function informeJson<T>(reportType: string, reportDocumentId: string): Promise<T> {
  return JSON.parse(await descargarInforme(reportType, reportDocumentId)) as T;
}

/**
 * Walks a huge pretty-printed JSON report (the whole marketplace's search terms: ~150 MB a week) row by row,
 * streaming and gunzipping it, without holding it in memory. Each row is a flat object of strings and numbers.
 */
export async function recorrerInformeGrande(reportDocumentId: string, alFila: (fila: Record<string, string | number>) => void): Promise<number> {
  const { Readable } = await import("node:stream");
  const { createGunzip } = await import("node:zlib");
  const { createInterface } = await import("node:readline");
  const doc = await spGet<{ url: string; compressionAlgorithm?: string }>(`/reports/2021-06-30/documents/${reportDocumentId}`);
  const res = await fetch(doc.url, { cache: "no-store" });
  if (!res.ok || !res.body) throw new Error(`descarga HTTP ${res.status}`);
  let flujo: NodeJS.ReadableStream = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
  if (doc.compressionAlgorithm === "GZIP") flujo = flujo.pipe(createGunzip());
  const lineas = createInterface({ input: flujo, crlfDelay: Infinity });
  let fila: Record<string, string | number> = {};
  let n = 0;
  for await (const linea of lineas) {
    const t = linea.trim();
    const m = t.match(/^"(\w+)"\s*:\s*(.+?),?$/);
    if (m && m[2] !== "[" && m[2] !== "{") {
      try {
        fila[m[1]] = JSON.parse(m[2]) as string | number;
      } catch {
        // A value we can't read is skipped; the rest of the row still counts.
      }
    } else if (t.startsWith("}") && Object.keys(fila).length) {
      alFila(fila);
      n++;
      fila = {};
    }
  }
  return n;
}

async function informePlano(reportType: string, marketplaceIds: string[], desde: Date | null): Promise<Record<string, string>[]> {
  const texto = await informe(reportType, marketplaceIds, desde);
  return texto ? filasPlanas(texto) : [];
}

export type DevolucionAmazon = {
  fecha: string;
  orderId: string;
  sku: string;
  asin: string;
  unidades: number;
  centro: string;
  /** Condition of the returned unit: SELLABLE, CUSTOMER_DAMAGED, CARRIER_DAMAGED, DEFECTIVE… */
  disposicion: string;
  /** Customer's reason: UNWANTED_ITEM, DEFECTIVE, NOT_AS_DESCRIBED… */
  motivo: string;
  estado: string;
  lpn: string;
  comentario: string;
};

/**
 * FBA customer returns since `desde`. One request covers every marketplace of the unified account
 * (EU and UK alike), but the rows don't say which: the country comes from the order.
 */
export async function devolucionesFBA(marketplaceId: string, desde: Date): Promise<DevolucionAmazon[]> {
  const filas = await informePlano("GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA", [marketplaceId], desde);
  return filas.map((f) => ({
    fecha: f["return-date"] ?? "",
    orderId: f["order-id"] ?? "",
    sku: f["sku"] ?? "",
    asin: f["asin"] ?? "",
    unidades: Number(f["quantity"]) || 1,
    centro: f["fulfillment-center-id"] ?? "",
    disposicion: f["detailed-disposition"] ?? "",
    motivo: f["reason"] ?? "",
    estado: f["status"] ?? "",
    lpn: f["license-plate-number"] ?? "",
    comentario: (f["customer-comments"] ?? "").slice(0, 300),
  }));
}

// ---------- Listings Items 2021-08-01 ----------

export type ProblemaListing = {
  severidad: "ERROR" | "WARNING" | string;
  codigo: string;
  mensaje: string;
  /** Amazon is acting on it (e.g. LISTING_SUPPRESSED), not just advising. */
  acciones: string[];
};
export type EstadoListing = { estado: string[]; problemas: ProblemaListing[] };

/** Status (BUYABLE, DISCOVERABLE) and open issues of one SKU in one marketplace; null if it isn't listed there. */
export async function estadoListing(sellerId: string, sku: string, marketplaceId: string): Promise<EstadoListing | null> {
  try {
    const r = await spGet<{
      summaries?: { status?: string[] }[];
      issues?: { severity: string; code: string; message: string; enforcements?: { actions?: { action: string }[] } }[];
    }>(`/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}`, {
      marketplaceIds: marketplaceId,
      includedData: ["summaries", "issues"],
      issueLocale: "es_ES",
    });
    return {
      // Sorted: Amazon returns the same statuses and issues in varying order, which would look like a change.
      estado: [...(r.summaries?.[0]?.status ?? [])].sort(),
      problemas: (r.issues ?? [])
        .map((i) => ({ severidad: i.severity, codigo: i.code, mensaje: i.message, acciones: i.enforcements?.actions?.map((a) => a.action) ?? [] }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo) || a.mensaje.localeCompare(b.mensaje)),
    };
  } catch (e) {
    if (e instanceof ErrorAmazon && e.status === 404) return null;
    throw e;
  }
}

/** The seller's own id, read from their offer on a SKU (the Sellers API doesn't return it for this account). */
export async function sellerIdPropio(sku: string, marketplaceId: string): Promise<string | null> {
  const r = await spGet<{ payload?: { Offers?: { MyOffer?: boolean; SellerId?: string }[] } }>(`/products/pricing/v0/listings/${encodeURIComponent(sku)}/offers`, {
    MarketplaceId: marketplaceId,
    ItemCondition: "New",
  });
  return r.payload?.Offers?.find((o) => o.MyOffer)?.SellerId ?? null;
}

// ---------- Fulfillment Inbound v0 ----------

export type EnvioFBA = { id: string; nombre: string; estado: string; centro: string; paisOrigen: string };
export type ArticuloEnvio = { sku: string; enviado: number; recibido: number };

/** Inbound shipments updated since `desde` (the whole account: EU and UK alike), any status. */
export async function enviosFBA(marketplaceId: string, desde: Date): Promise<EnvioFBA[]> {
  const estados = ["WORKING", "READY_TO_SHIP", "SHIPPED", "IN_TRANSIT", "DELIVERED", "CHECKED_IN", "RECEIVING", "CLOSED", "CANCELLED", "DELETED", "ERROR"];
  type Respuesta = {
    payload?: {
      ShipmentData?: { ShipmentId: string; ShipmentName?: string; ShipmentStatus?: string; DestinationFulfillmentCenterId?: string; ShipFromAddress?: { CountryCode?: string } }[];
      NextToken?: string;
    };
  };
  const res: EnvioFBA[] = [];
  let NextToken: string | undefined;
  // A year is ~60 shipments (2 pages): the cap only guards against a token that never ends.
  let paginas = 0;
  do {
    const r = await spGet<Respuesta>(
      "/fba/inbound/v0/shipments",
      NextToken
        ? { MarketplaceId: marketplaceId, QueryType: "NEXT_TOKEN", NextToken }
        : { MarketplaceId: marketplaceId, QueryType: "DATE_RANGE", ShipmentStatusList: estados, LastUpdatedAfter: desde.toISOString(), LastUpdatedBefore: new Date(Date.now() - 3 * 60_000).toISOString() },
    );
    for (const s of r.payload?.ShipmentData ?? [])
      res.push({ id: s.ShipmentId, nombre: s.ShipmentName ?? "", estado: s.ShipmentStatus ?? "", centro: s.DestinationFulfillmentCenterId ?? "", paisOrigen: s.ShipFromAddress?.CountryCode ?? "" });
    NextToken = r.payload?.NextToken || undefined;
  } while (NextToken && ++paginas < 40);
  return res;
}

/**
 * Units sent and received per SKU of one inbound shipment. This endpoint returns every item at once; it
 * echoes a NextToken it doesn't honour, so following it would loop forever.
 */
export async function articulosEnvioFBA(marketplaceId: string, shipmentId: string): Promise<ArticuloEnvio[]> {
  const r = await spGet<{ payload?: { ItemData?: { SellerSKU: string; QuantityShipped?: number; QuantityReceived?: number }[] } }>(
    `/fba/inbound/v0/shipments/${encodeURIComponent(shipmentId)}/items`,
    { MarketplaceId: marketplaceId },
  );
  return (r.payload?.ItemData ?? []).map((i) => ({ sku: i.SellerSKU, enviado: i.QuantityShipped ?? 0, recibido: i.QuantityReceived ?? 0 }));
}

export type InventarioPais = { sku: string; asin: string; pais: string; unidades: number };

/** Volume per unit converted to cubic metres (Amazon gives cubic metres in Europe, cubic feet in the UK). */
function aMetrosCubicos(v: number, unidad: string): number {
  if (/feet|foot|ft/i.test(unidad)) return v * 0.0283168;
  if (/inch/i.test(unidad)) return v * 0.0000163871;
  if (/centim/i.test(unidad)) return v / 1_000_000;
  return v;
}

/**
 * Storage space used in a marketplace's region, in cubic metres, from the FBA inventory planning report: units
 * in the warehouses (available, reserved, unfulfillable) and on their way there, by each SKU's volume.
 */
export async function espacioOcupado(marketplaceId: string): Promise<{ enAlmacen: number; enCamino: number }> {
  const filas = await informePlano("GET_FBA_INVENTORY_PLANNING_DATA", [marketplaceId], null);
  let enAlmacen = 0;
  let enCamino = 0;
  const n = (v: string | undefined) => Number(v) || 0;
  for (const f of filas) {
    const volumen = aMetrosCubicos(n(f["item-volume"]), f["volume-unit-measurement"] ?? "");
    if (!volumen) continue;
    enAlmacen += (n(f["available"]) + n(f["Total Reserved Quantity"]) + n(f["unfulfillable-quantity"])) * volumen;
    enCamino += n(f["inbound-quantity"]) * volumen;
  }
  return { enAlmacen, enCamino };
}

/**
 * Pan-European FBA status of every SKU (the report comes in the account's language: «Inscrito», «Válido»,
 * «Fin de inscripción próximo», «Inscripción finalizada», «No válido»… or the English ones).
 */
export async function estadoPanEuropeo(marketplaceId: string): Promise<{ sku: string; asin: string; estado: string }[]> {
  const filas = await informePlano("GET_PAN_EU_OFFER_STATUS", [marketplaceId], null);
  const limpia = (k: string) => k.replace(/^﻿/, "").trim();
  return filas
    .map((f) => {
      const c = Object.fromEntries(Object.entries(f).map(([k, v]) => [limpia(k), v]));
      const clave = (re: RegExp) => Object.keys(c).find((k) => re.test(k));
      const estado = clave(/^(estado de paneu|pan-?eu status)$/i) ?? clave(/estado.*paneu|pan-?eu.*status/i);
      return { sku: c[clave(/sku/i) ?? "MerchantSKU"] ?? "", asin: c.ASIN ?? "", estado: estado ? (c[estado] ?? "") : "" };
    })
    .filter((x) => x.sku);
}

/**
 * Sellable units per SKU in each country's warehouses right now (a snapshot: no date range). For
 * Pan-European FBA it shows where the EU pool physically is; the UK appears as "GB".
 */
export async function inventarioPorPais(marketplaceId: string): Promise<InventarioPais[]> {
  const filas = await informePlano("GET_AFN_INVENTORY_DATA_BY_COUNTRY", [marketplaceId], null);
  return filas
    .filter((f) => (f["condition-type"] ?? "NewItem") === "NewItem")
    .map((f) => ({ sku: f["seller-sku"] ?? "", asin: f["asin"] ?? "", pais: (f["country"] ?? "").toUpperCase(), unidades: Number(f["quantity-for-local-fulfillment"]) || 0 }));
}

// ---------- Seller performance (account health) ----------

type MetricaPolitica = { status?: string; defectsCount?: number; reportingDateRange?: { reportingDateFrom?: string; reportingDateTo?: string } };
export type RendimientoVendedor = {
  accountStatuses?: { marketplaceId: string; status: string }[];
  performanceMetrics?: ({
    marketplaceId?: string;
    accountHealthRating?: { ahrStatus?: string; ahrScore?: number; reportingDateRange?: { reportingDateFrom?: string; reportingDateTo?: string } };
    policyViolationWarnings?: { warningsCount?: number };
  } & Record<string, unknown> & Partial<Record<string, MetricaPolitica>>)[];
};

/** Account health of one marketplace: status, Account Health Rating and policy compliance counts (JSON report). */
export async function rendimientoVendedor(marketplaceId: string): Promise<RendimientoVendedor | null> {
  const texto = await informe("GET_V2_SELLER_PERFORMANCE_REPORT", [marketplaceId], null);
  return texto ? (JSON.parse(texto) as RendimientoVendedor) : null;
}

// ---------- Settlement reports (payouts) ----------

export type Liquidacion = { reportId: string; reportDocumentId: string; desde: string; hasta: string };

/** Settlement reports Amazon has published in the last 90 days (it keeps them no longer), newest first. */
export async function liquidacionesDisponibles(): Promise<Liquidacion[]> {
  const res: Liquidacion[] = [];
  let nextToken: string | undefined;
  do {
    const r = await spGet<{ reports?: { reportId: string; reportDocumentId?: string; dataStartTime?: string; dataEndTime?: string }[]; nextToken?: string }>(
      "/reports/2021-06-30/reports",
      nextToken
        ? { nextToken }
        : { reportTypes: "GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2", createdSince: new Date(Date.now() - 89 * 86_400_000).toISOString(), pageSize: 100 },
    );
    for (const x of r.reports ?? []) if (x.reportDocumentId) res.push({ reportId: x.reportId, reportDocumentId: x.reportDocumentId, desde: x.dataStartTime ?? "", hasta: x.dataEndTime ?? "" });
    nextToken = r.nextToken || undefined;
  } while (nextToken);
  return res.sort((a, b) => b.hasta.localeCompare(a.hasta));
}

/** Rows of one settlement report (column → value, as Amazon writes them: dates dd.mm.yyyy, EUR amounts with a decimal comma). */
export async function filasLiquidacion(reportDocumentId: string): Promise<Record<string, string>[]> {
  return filasPlanas(await descargarInforme("GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2", reportDocumentId));
}
