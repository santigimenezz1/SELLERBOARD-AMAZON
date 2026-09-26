import "server-only";

import type { Desglose, Importe, TransaccionAmazon } from "./apis";

/**
 * A Finances transaction reduced to what the profit maths needs, per SKU.
 * Amounts stay in the transaction's own currency and are positive when they
 * cost the seller money: `comisiones` 3.40 = Amazon kept 3.40 in fees;
 * `reembolso` 19.99 = 19.99 went back to the customer.
 * `iva` is the VAT inside the sale (or inside the refund, for refunds), or
 * null when the transaction doesn't break tax out.
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
  /** true for the sale's own charge ("Order Payment"): once it exists the order's real fees are known. */
  esCargoVenta: boolean;
  lineas: { sku: string | null; comisiones: number; reembolso: number; iva: number | null }[];
};

const FEE = /fee|commission|expense/i;
const TAX = /tax|vat/i;
// Tax Amazon collects and remits itself (marketplace facilitator): it offsets the tax line, it isn't extra VAT.
const RETENIDO = /withh/i;
const REEMBOLSO = /refund|chargeback|guarantee/i;
const VENTA = /shipment|order payment/i;

type Hoja = { ruta: string[]; importe: Importe };

/** Only leaves are summed: parent breakdowns already contain their children's amounts. */
function hojas(desgloses: Desglose[] | undefined, ruta: string[] = []): Hoja[] {
  const res: Hoja[] = [];
  for (const d of desgloses ?? []) {
    const r = [...ruta, d.breakdownType ?? ""];
    if (d.breakdowns?.length) res.push(...hojas(d.breakdowns, r));
    else if (d.breakdownAmount) res.push({ ruta: r, importe: d.breakdownAmount });
  }
  return res;
}

function clasificar(desgloses: Desglose[] | undefined) {
  let fees = 0;
  let cargos = 0; // principal, shipping, gift wrap, promotions… and the tax on them
  let iva: number | null = null; // the tax part of `cargos`
  for (const h of hojas(desgloses)) {
    const v = Number(h.importe.currencyAmount) || 0;
    // VAT charged on Amazon's own fees is part of the fee cost, so FEE wins over TAX.
    if (h.ruta.some((s) => FEE.test(s))) {
      fees += v;
      continue;
    }
    cargos += v;
    if (h.ruta.some((s) => TAX.test(s)) && !h.ruta.some((s) => RETENIDO.test(s))) iva = (iva ?? 0) + v;
  }
  return { fees, cargos, iva };
}

export function resumirTransaccion(t: TransaccionAmazon): TransaccionResumida | null {
  const orderId = t.relatedIdentifiers?.find((r) => r.relatedIdentifierName === "ORDER_ID")?.relatedIdentifierValue;
  // Account-level movements (storage fees, subscription, payouts…) have no order: out of scope for phase 1.
  if (!orderId) return null;

  const clase = `${t.transactionType ?? ""} ${t.description ?? ""}`;
  const esReembolso = REEMBOLSO.test(clase);
  const esVenta = !esReembolso && VENTA.test(clase);

  const convertir = (d: Desglose[] | undefined, total: Importe | undefined) => {
    const { fees, cargos, iva } = clasificar(d);
    const hayDesglose = (d?.length ?? 0) > 0;
    const totalNum = Number(total?.currencyAmount) || 0;
    if (esReembolso) {
      // Money back to the customer (negative charges) → reembolso; fee refunds/admin fees → comisiones.
      return hayDesglose ? { comisiones: -fees, reembolso: -cargos, iva: iva === null ? null : -iva } : { comisiones: 0, reembolso: -totalNum, iva: null };
    }
    if (esVenta) return { comisiones: -fees, reembolso: 0, iva };
    // Any other order-linked adjustment (retrocharges, reimbursements…): its net effect counts as fees.
    return { comisiones: -(hayDesglose ? fees + cargos : totalNum), reembolso: 0, iva: null };
  };

  const skuDe = (item: NonNullable<TransaccionAmazon["items"]>[number]) => item.contexts?.find((c) => c.sku)?.sku ?? null;
  const items = t.items ?? [];
  let lineas: TransaccionResumida["lineas"];
  if (items.some((i) => i.breakdowns?.length)) {
    // Per-item breakdowns: the transaction-level ones are just their sum, so they're ignored.
    lineas = items.map((i) => ({ sku: skuDe(i), ...convertir(i.breakdowns, i.totalAmount) }));
  } else {
    // Only a transaction-level breakdown: a sku=null line is split across the order's lines by sales weight.
    lineas = [{ sku: items.length === 1 ? skuDe(items[0]) : null, ...convertir(t.breakdowns, t.totalAmount) }];
  }

  const moneda = t.totalAmount?.currencyCode ?? t.items?.[0]?.totalAmount?.currencyCode ?? hojas(t.breakdowns)[0]?.importe.currencyCode ?? "EUR";

  return {
    transactionId: t.transactionId,
    orderId,
    tipo: t.transactionType ?? "",
    estado: t.transactionStatus ?? null,
    descripcion: t.description ?? null,
    fechaPublicacion: new Date(t.postedDate),
    marketplaceId: t.marketplaceDetails?.marketplaceId ?? null,
    moneda,
    esCargoVenta: esVenta,
    lineas,
  };
}
