import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { gruposFinancieros, importeRetenido, mercadosDeGrupo } from "@/lib/amazon/apis";
import { eurPorUnidad } from "@/lib/amazon/tiposCambio";
import { marketplaceConocido, marketplacePorNombre } from "./marketplacesConocidos";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * Seller Central's «Saldo total» of each marketplace: the balance of its open settlement period plus the money
 * Amazon is still holding (sales not released yet). Checked against Seller Central to the cent.
 *
 * One doc, `config/saldos`, kept in memory; the complete sync refreshes it.
 */

export type SaldoMercado = { moneda: string; abierto: number; retenido: number };
type Doc = { mercados: Record<string, SaldoMercado>; actualizadoEn: string | null };

const g = globalThis as unknown as { __saldos?: Doc };
const ref = () => adminDb().collection("config").doc("saldos");
const r2 = (v: number) => Math.round(v * 100) / 100;

export async function obtenerSaldos(): Promise<Doc> {
  if (g.__saldos) return g.__saldos;
  const snap = await ref().get();
  contarLecturas(1);
  g.__saldos = { mercados: (snap.get("mercados") as Doc["mercados"] | undefined) ?? {}, actualizadoEn: (snap.get("actualizadoEn") as string | undefined) ?? null };
  return g.__saldos;
}

/** Re-reads every marketplace's balance; `conVentas` adds marketplaces that may hold money without an open period yet. */
export async function actualizarSaldos(conVentas: string[]): Promise<void> {
  const mercados: Record<string, SaldoMercado> = {};
  const hace = (dias: number) => new Date(Date.now() - dias * 24 * 3600_000);

  // Open settlement periods: each belongs to one marketplace, told by its events.
  for (const gr of await gruposFinancieros(hace(90))) {
    const total = Number(gr.OriginalTotal?.CurrencyAmount) || 0;
    if (gr.ProcessingStatus !== "Open" || !gr.FinancialEventGroupId || !total) continue;
    const id = (await mercadosDeGrupo(gr.FinancialEventGroupId)).map(marketplacePorNombre).find(Boolean);
    if (!id) continue;
    const m = (mercados[id] ??= { moneda: gr.OriginalTotal?.CurrencyCode ?? "EUR", abierto: 0, retenido: 0 });
    m.abierto = r2(m.abierto + total);
  }

  // Money held back, per marketplace.
  for (const id of new Set([...Object.keys(mercados), ...conVentas])) {
    const r = await importeRetenido(id, hace(60));
    if (!r.importe) continue;
    const m = (mercados[id] ??= { moneda: r.moneda ?? marketplaceConocido(id)?.moneda ?? "EUR", abierto: 0, retenido: 0 });
    m.retenido = r2(m.retenido + r.importe);
  }

  const doc = await obtenerSaldos();
  if (JSON.stringify(doc.mercados) === JSON.stringify(mercados)) return;
  const nuevo = { mercados, actualizadoEn: new Date().toISOString() };
  await ref().set(nuevo);
  contarEscrituras(1);
  g.__saldos = nuevo;
}

/** The balance to show: one marketplace in its own currency, or all of them added up in euros. */
export async function saldoTotal(marketplaceId: string | null): Promise<{ importe: number; moneda: string } | null> {
  const { mercados } = await obtenerSaldos();
  if (marketplaceId) {
    const m = mercados[marketplaceId];
    return { importe: m ? r2(m.abierto + m.retenido) : 0, moneda: m?.moneda ?? marketplaceConocido(marketplaceId)?.moneda ?? "EUR" };
  }
  if (Object.keys(mercados).length === 0) return null;
  let eur = 0;
  for (const m of Object.values(mercados)) eur += (m.abierto + m.retenido) * (await eurPorUnidad(m.moneda, new Date()));
  return { importe: r2(eur), moneda: "EUR" };
}
