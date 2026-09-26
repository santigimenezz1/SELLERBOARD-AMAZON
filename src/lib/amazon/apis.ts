import "server-only";

import { spGet } from "./cliente";

/*
 * The three SP-API operations this app uses, typed with only the fields we read.
 *
 * - Sellers API v1        getMarketplaceParticipations
 * - Orders API 2026-01-01 searchOrders (replaces Orders v0, removed 27/03/2027;
 *   it returns the order items inline, so no per-order getOrderItems calls)
 * - Finances 2024-06-19   listTransactions (replaces Finances v0, removed 27/08/2027)
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
      marketplaceIds: marketplaceIds.slice(0, 50),
      includedData: ["PROCEEDS", "FULFILLMENT"],
      maxResultsPerPage: 100,
      paginationToken,
    });
    pedidos.push(...(res.orders ?? []));
    paginationToken = res.pagination?.nextToken || undefined;
  } while (paginationToken);
  return pedidos;
}

// ---------- Finances ----------

export type Importe = { currencyCode: string; currencyAmount: number };
export type Desglose = { breakdownType: string; breakdownAmount: Importe; breakdowns?: Desglose[] };
type Contexto = { contextType?: string; sku?: string; asin?: string; quantityShipped?: number };

export type TransaccionAmazon = {
  transactionId: string;
  transactionType?: string;
  transactionStatus?: string;
  description?: string;
  postedDate: string;
  totalAmount?: Importe;
  marketplaceDetails?: { marketplaceId?: string };
  relatedIdentifiers?: { relatedIdentifierName: string; relatedIdentifierValue: string }[];
  breakdowns?: Desglose[];
  items?: {
    description?: string;
    totalAmount?: Importe;
    breakdowns?: Desglose[];
    contexts?: Contexto[];
    relatedIdentifiers?: { itemRelatedIdentifierName: string; itemRelatedIdentifierValue: string }[];
  }[];
};

/** Transactions posted in [desde, hasta). The API returns nothing if the window exceeds 180 days. */
export async function transacciones(desde: Date, hasta: Date): Promise<TransaccionAmazon[]> {
  const todas: TransaccionAmazon[] = [];
  let nextToken: string | undefined;
  do {
    const res = await spGet<{ payload?: { transactions?: TransaccionAmazon[]; nextToken?: string } }>("/finances/2024-06-19/transactions", {
      postedAfter: desde.toISOString(),
      postedBefore: hasta.toISOString(),
      nextToken,
    });
    todas.push(...(res.payload?.transactions ?? []));
    nextToken = res.payload?.nextToken || undefined;
  } while (nextToken);
  return todas;
}
