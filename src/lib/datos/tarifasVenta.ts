import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import type { TarifaVenta } from "@/lib/amazon/finanzas";
import { contarEscrituras, contarLecturas } from "./consumo";
import { tipoIvaGeneral } from "./iva";
import { marketplaceConocido } from "./marketplacesConocidos";

/*
 * Real per-unit fees of the latest clean sale of each SKU in each marketplace
 * (see `muestrasTarifas`): the base of "Lo que te paga Amazon" on a product
 * page. All in one doc, `config/tarifasVenta`, read once per server process
 * and written by the sync only when a newer sale changed something.
 */

type Doc = { muestras: Record<string, TarifaVenta> };
/** Bumped when the sample rules change: the sync then rebuilds the doc from further back. */
const VERSION = 2;
const g = globalThis as unknown as { __tarifasVentaV2?: Doc | null };
const clave = (t: Pick<TarifaVenta, "sku" | "marketplaceId">) => `${t.sku}|${t.marketplaceId}`;
const ref = () => adminDb().collection("config").doc("tarifasVenta");

/** null = never built yet (the sync then looks further back once to fill it). */
async function leer(): Promise<Doc | null> {
  if (g.__tarifasVentaV2 !== undefined) return g.__tarifasVentaV2;
  const snap = await ref().get();
  contarLecturas(1);
  g.__tarifasVentaV2 = snap.exists && snap.get("version") === VERSION ? { muestras: (snap.get("muestras") as Record<string, TarifaVenta>) ?? {} } : null;
  return g.__tarifasVentaV2;
}

export async function tarifasCreadas(): Promise<boolean> {
  return (await leer()) !== null;
}

/**
 * A sale taxed at the marketplace country's own rate (a German sale at 19 %, not one shipped to an Austrian
 * buyer at 20 %), so the VAT shown matches what most buyers there pay.
 */
function tipica(t: TarifaVenta): boolean {
  const tipo = tipoIvaGeneral(marketplaceConocido(t.marketplaceId)?.codigoPais);
  const base = t.precio - t.iva;
  return tipo === undefined || (base > 0 && Math.abs(t.iva / base - tipo) < 0.005);
}

/** Whether sample `t` should replace `previa`: typical beats atypical, then the newer wins. */
const mejor = (t: TarifaVenta, previa: TarifaVenta | undefined) => !previa || (tipica(t) !== tipica(previa) ? tipica(t) : t.fecha > previa.fecha);

/** Keeps the newest typical sample per SKU and marketplace (a newer atypical one only if there is no typical one). One write, only if something changed. Returns writes done. */
export async function guardarTarifas(nuevas: TarifaVenta[]): Promise<number> {
  const actual = await leer();
  const muestras = { ...(actual?.muestras ?? {}) };
  let cambio = actual === null;
  for (const t of nuevas) {
    const previa = muestras[clave(t)];
    if (!mejor(t, previa)) continue;
    muestras[clave(t)] = t;
    cambio = true;
  }
  if (!cambio) return 0;
  await ref().set({ version: VERSION, muestras, actualizadoEn: new Date().toISOString() });
  contarEscrituras(1);
  g.__tarifasVentaV2 = { muestras };
  return 1;
}

/** Best sample per marketplace among these SKUs (a product may have several). */
export async function tarifasDeSkus(skus: string[]): Promise<Record<string, TarifaVenta>> {
  const doc = await leer();
  const res: Record<string, TarifaVenta> = {};
  for (const t of Object.values(doc?.muestras ?? {})) {
    if (!skus.includes(t.sku)) continue;
    if (mejor(t, res[t.marketplaceId])) res[t.marketplaceId] = t;
  }
  return res;
}
