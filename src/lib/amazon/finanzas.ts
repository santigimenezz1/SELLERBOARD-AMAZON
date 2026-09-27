import "server-only";

import type { Componente, EventoPedido, EventosFinancieros, ItemEvento } from "./apis";

/**
 * A financial event reduced to what the profit maths needs, per SKU.
 * Amounts stay in the event's own currency and are positive when they cost
 * the seller money: `comisiones` 3.40 = Amazon kept 3.40 in fees;
 * `reembolso` 19.99 = 19.99 went back to the customer.
 * `iva` is the VAT inside the sale (or inside the refund, for refunds), or
 * null when the event doesn't break tax out.
 */
export type TransaccionResumida = {
  transactionId: string;
  orderId: string;
  tipo: string;
  estado: string | null;
  descripcion: string | null;
  fechaPublicacion: Date;
  marketplaceId: string | null;
  moneda: string;
  /** true for the sale's own charge (shipment event): once it exists the order's real fees are known. */
  esCargoVenta: boolean;
  lineas: { sku: string | null; comisiones: number; reembolso: number; iva: number | null }[];
};

const importe = (c: Componente) => c.ChargeAmount ?? c.FeeAmount ?? c.PromotionAmount;
const suma = (cs: Componente[] | undefined, filtro: (c: Componente) => boolean = () => true) =>
  (cs ?? []).filter(filtro).reduce((s, c) => s + (Number(importe(c)?.CurrencyAmount) || 0), 0);
// "Tax", "ShippingTax", "GiftWrapTax"… (the withheld marketplace-facilitator VAT lives in a separate list and isn't extra VAT).
const esIva = (c: Componente) => /tax/i.test(c.ChargeType ?? "");

/** Stable id from the event's own fields, so re-fetching the same event overwrites it instead of duplicating. */
function idEvento(tipo: string, e: EventoPedido, items: ItemEvento[]): string {
  const partes = items.map((i) => i.OrderItemId ?? i.OrderAdjustmentItemId ?? i.SellerSKU ?? "").join("-");
  return `v0_${tipo}_${e.AmazonOrderId}_${e.PostedDate}_${partes}`.replace(/[^A-Za-z0-9_-]/g, "");
}

function resumir(tipo: "Shipment" | "Refund" | "GuaranteeClaim" | "Chargeback", e: EventoPedido, marketplaceId: (nombre: string | undefined) => string | null): TransaccionResumida | null {
  // Account-level movements (storage fees, subscription, payouts…) aren't order events: out of scope for phase 1.
  if (!e.AmazonOrderId || !e.PostedDate) return null;
  const esVenta = tipo === "Shipment";
  const items = (esVenta ? e.ShipmentItemList : e.ShipmentItemAdjustmentList) ?? [];
  if (items.length === 0) return null;

  const lineas = items.map((i) => {
    const cargos = esVenta ? i.ItemChargeList : i.ItemChargeAdjustmentList;
    const fees = esVenta ? i.ItemFeeList : i.ItemFeeAdjustmentList;
    const promos = esVenta ? i.PromotionList : i.PromotionAdjustmentList;
    const hayIva = (cargos ?? []).some(esIva);
    const iva = hayIva ? suma(cargos, esIva) : null;
    return {
      sku: i.SellerSKU ?? null,
      // Fees come negative on a sale; on a refund Amazon gives part back (positive) and charges a refund fee.
      comisiones: -suma(fees),
      // Money back to the customer comes negative: principal, shipping, gift wrap and their tax, net of promotions.
      reembolso: esVenta ? 0 : -(suma(cargos) + suma(promos)),
      iva: iva === null ? null : esVenta ? iva : -iva,
    };
  });

  const primero = items.flatMap((i) => [...(i.ItemChargeList ?? []), ...(i.ItemChargeAdjustmentList ?? []), ...(i.ItemFeeList ?? []), ...(i.ItemFeeAdjustmentList ?? [])])[0];
  return {
    transactionId: idEvento(tipo, e, items),
    orderId: e.AmazonOrderId,
    tipo,
    estado: null,
    descripcion: null,
    fechaPublicacion: new Date(e.PostedDate),
    marketplaceId: marketplaceId(e.MarketplaceName),
    moneda: (primero && importe(primero)?.CurrencyCode) || "EUR",
    esCargoVenta: esVenta,
    lineas,
  };
}

/** Order-linked events → summaries. Guarantee claims and chargebacks take money back like refunds. */
export function resumirEventos(ev: EventosFinancieros, marketplaceId: (nombre: string | undefined) => string | null): TransaccionResumida[] {
  const res = [
    ...ev.ShipmentEventList.map((e) => resumir("Shipment", e, marketplaceId)),
    ...ev.RefundEventList.map((e) => resumir("Refund", e, marketplaceId)),
    ...ev.GuaranteeClaimEventList.map((e) => resumir("GuaranteeClaim", e, marketplaceId)),
    ...ev.ChargebackEventList.map((e) => resumir("Chargeback", e, marketplaceId)),
  ];
  return res.filter((t): t is TransaccionResumida => t !== null);
}

/**
 * What Amazon charged and paid for ONE unit of a real sale, per SKU and marketplace, in the sale's currency.
 * Costs are positive. `precio` is what the customer paid (VAT included); `ivaRetenido` the part Amazon kept
 * as marketplace-facilitator VAT (0 when the seller declares it).
 */
export type TarifaVenta = {
  sku: string;
  marketplaceId: string;
  moneda: string;
  fecha: string;
  precio: number;
  iva: number;
  ivaRetenido: number;
  comision: number;
  fba: number;
  serviciosDigitales: number;
  otras: number;
};

const r4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * One fee sample per clean sale line: plain price + tax, no promotion (Vine units come as a 100 % promotion),
 * no shipping or gift-wrap charges, a normal referral fee. These are the lines whose fees can be scaled to another price.
 */
export function muestrasTarifas(ev: EventosFinancieros, marketplaceId: (nombre: string | undefined) => string | null): TarifaVenta[] {
  const res: TarifaVenta[] = [];
  for (const e of ev.ShipmentEventList) {
    const mk = marketplaceId(e.MarketplaceName);
    if (!mk || !e.PostedDate) continue;
    for (const i of e.ShipmentItemList ?? []) {
      const uds = i.QuantityShipped ?? 0;
      if (!i.SellerSKU || uds < 1) continue;
      const cargos = i.ItemChargeList ?? [];
      if (cargos.some((c) => !["Principal", "Tax"].includes(c.ChargeType ?? "") && Number(importe(c)?.CurrencyAmount))) continue;
      if (suma(i.PromotionList) !== 0) continue;
      const principal = suma(cargos, (c) => c.ChargeType === "Principal");
      if (principal <= 0) continue;
      const fee = (tipo: string) => -suma(i.ItemFeeList, (c) => c.FeeType === tipo);
      const comision = fee("Commission");
      const fba = fee("FBAPerUnitFulfillmentFee");
      const serviciosDigitales = fee("DigitalServicesFee");
      const retenido = -(i.ItemTaxWithheldList ?? []).reduce((s, w) => s + suma(w.TaxesWithheld), 0);
      const iva = suma(cargos, esIva);
      // Odd lines (no referral fee, or more VAT withheld than charged) would make a misleading base.
      if (comision <= 0 || retenido > iva + 0.01) continue;
      res.push({
        sku: i.SellerSKU,
        marketplaceId: mk,
        moneda: importe(cargos[0])?.CurrencyCode ?? "EUR",
        fecha: e.PostedDate,
        precio: r4((principal + iva) / uds),
        iva: r4(iva / uds),
        ivaRetenido: r4(retenido / uds),
        comision: r4(comision / uds),
        fba: r4(fba / uds),
        serviciosDigitales: r4(serviciosDigitales / uds),
        otras: r4((-suma(i.ItemFeeList) - comision - fba - serviciosDigitales) / uds),
      });
    }
  }
  return res;
}
