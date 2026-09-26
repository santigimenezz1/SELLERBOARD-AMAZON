import "server-only";

import { spGet } from "./cliente";

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

/** Orders updated in [desde, hasta] across the given marketplaces, following every page. */
export async function pedidosActualizados(desde: Date, hasta: Date, marketplaceIds: string[]): Promise<PedidoAmazon[]> {
  const pedidos: PedidoAmazon[] = [];
  let paginationToken: string | undefined;
  do {
    const res = await spGet<{ orders?: PedidoAmazon[]; pagination?: { nextToken?: string } }>("/orders/2026-01-01/orders", {
      lastUpdatedAfter: desde.toISOString(),
      lastUpdatedBefore: hasta.toISOString(),
      // Empty list = every marketplace the account sells in.
      marketplaceIds: marketplaceIds.length ? marketplaceIds.slice(0, 50) : undefined,
      includedData: ["PROCEEDS", "FULFILLMENT"],
      maxResultsPerPage: 100,
      paginationToken,
    });
    pedidos.push(...(res.orders ?? []));
    paginationToken = res.pagination?.nextToken || undefined;
  } while (paginationToken);
  return pedidos;
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
};

/** Shape shared by shipment, refund, guarantee-claim and chargeback events. */
export type EventoPedido = {
  AmazonOrderId?: string;
  MarketplaceName?: string;
  PostedDate?: string;
  ShipmentItemList?: ItemEvento[];
  ShipmentItemAdjustmentList?: ItemEvento[];
};

export type EventosFinancieros = {
  ShipmentEventList: EventoPedido[];
  RefundEventList: EventoPedido[];
  GuaranteeClaimEventList: EventoPedido[];
  ChargebackEventList: EventoPedido[];
};

/** Order-linked financial events posted in [desde, hasta). Empty if the window exceeds 180 days. */
export async function eventosFinancieros(desde: Date, hasta: Date): Promise<EventosFinancieros> {
  const res: EventosFinancieros = { ShipmentEventList: [], RefundEventList: [], GuaranteeClaimEventList: [], ChargebackEventList: [] };
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
