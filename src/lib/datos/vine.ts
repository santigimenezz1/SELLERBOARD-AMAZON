import "server-only";

import { asegurarAlmacen, pedidosEnAlmacen } from "./almacen";
import { idUltimaSync } from "./panel";
import { diaMadrid } from "./fechas";
import { marketplaceConocido } from "./marketplacesConocidos";
import { ETIQUETAS_POR_ASIN } from "./etiquetas";
import { costeTotal, obtenerEscandallo, regionDeMarketplace } from "./escandallos";
import { tarifasDeSkus } from "./tarifasVenta";
import { obtenerGastos } from "./gastos";

/*
 * Amazon Vine: the units given to reviewers and what they cost. Amazon doesn't flag Vine orders: they're the
 * orders whose item came with a 100 % discount (price 0), with a normal order id (replacements start with «S0»).
 * Each unit costs Amazon's fees (real once the order is settled; until then the FBA fee of a real sale there)
 * plus the product's cost; the enrollment fees come from the account charges. All in memory: no extra reads.
 */

export type PedidoVine = {
  orderId: string;
  dia: string;
  marketplaceId: string;
  pais: string;
  codigoPais: string;
  asin: string;
  sku: string;
  titulo: string;
  etiqueta: string | null;
  unidades: number;
  estado: string;
  /** Amazon's fees (euros), real or estimated. */
  tarifas: number;
  tarifasEstimadas: boolean;
  /** Product cost (euros), or null without a cost breakdown. */
  coste: number | null;
};
export type CuotaVine = { fecha: string | null; mes: string; region: "eu" | "uk"; importe: number; moneda: string; eur: number };

export async function datosVine(): Promise<{ pedidos: PedidoVine[]; cuotas: CuotaVine[] }> {
  await asegurarAlmacen(await idUltimaSync());
  const lineas = [...pedidosEnAlmacen().values()].filter((p) => p.ventaTotal === 0 && p.unidades > 0 && p.estado !== "CANCELLED" && !p.amazonOrderId.startsWith("S0"));

  const costes = new Map<string, number | null>();
  const muestras = new Map<string, Awaited<ReturnType<typeof tarifasDeSkus>>>();
  const pedidos: PedidoVine[] = [];
  for (const p of lineas) {
    const region = regionDeMarketplace(p.marketplaceId);
    const kc = `${p.asin}|${region}`;
    if (!costes.has(kc)) {
      const e = await obtenerEscandallo(p.asin, region);
      const c = costeTotal(e);
      costes.set(kc, e.actualizadoEn && c > 0 ? c : null);
    }
    if (!muestras.has(p.sku)) muestras.set(p.sku, await tarifasDeSkus([p.sku]));
    // Not settled yet: a free unit pays the FBA fee (and any fixed fee) of a real sale of that SKU there.
    const m = muestras.get(p.sku)?.[p.marketplaceId];
    const estimada = m ? (m.fba + m.otras) * (m.moneda === p.moneda && p.tipoCambio > 0 ? p.tipoCambio : 1) * p.unidades : 0;
    const unitario = costes.get(kc) ?? null;
    const mk = marketplaceConocido(p.marketplaceId);
    pedidos.push({
      orderId: p.amazonOrderId,
      dia: diaMadrid(p.fecha),
      marketplaceId: p.marketplaceId,
      pais: mk?.pais ?? p.pais,
      codigoPais: mk?.codigoPais ?? "",
      asin: p.asin,
      sku: p.sku,
      titulo: p.titulo,
      etiqueta: ETIQUETAS_POR_ASIN[p.asin] ?? null,
      unidades: p.unidades,
      estado: p.estado,
      tarifas: Math.round((p.liquidado ? p.comisionesAmazon : estimada) * 100) / 100,
      tarifasEstimadas: !p.liquidado,
      coste: p.costeProducto ?? (unitario !== null ? Math.round(unitario * p.unidades * 100) / 100 : null),
    });
  }
  pedidos.sort((a, b) => b.dia.localeCompare(a.dia) || a.pais.localeCompare(b.pais, "es"));

  const cuotas = (await obtenerGastos()).lineas
    .filter((l) => l.categoria === "vine")
    .map((l) => ({ fecha: l.fecha, mes: l.mes, region: l.region, importe: l.importe, moneda: l.moneda, eur: l.eur }))
    .sort((a, b) => (b.fecha ?? b.mes).localeCompare(a.fecha ?? a.mes));
  return { pedidos, cuotas };
}
