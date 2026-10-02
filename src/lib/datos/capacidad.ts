import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { espacioOcupado } from "@/lib/amazon/apis";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * FBA storage capacity, per region (Europe / UK), in cubic metres:
 * - used: worked out from Amazon's inventory planning report (units in the warehouses + on their way there, by
 *   each SKU's volume), refreshed by the complete sync at most every 6 hours;
 * - limit: Amazon sets it each month in Seller Central's Capacity Monitor and the API doesn't give it, so it's
 *   typed in by hand.
 * One doc, `config/capacidad`, kept in memory.
 */

export type RegionCapacidad = "eu" | "uk";
export type Capacidad = {
  uso: Record<RegionCapacidad, { enAlmacen: number; enCamino: number }> | null;
  limites: Record<RegionCapacidad, number | null>;
  usoActualizadoEn: string | null;
  limitesActualizadosEn: string | null;
};

const REFRESCO_MS = 6 * 3600_000;
const MERCADO: Record<RegionCapacidad, string> = { eu: "A1RKKUPIHCS9HS", uk: "A1F83G8C2ARO7P" };
const g = globalThis as unknown as { __capacidad?: Capacidad };
const ref = () => adminDb().collection("config").doc("capacidad");

export async function obtenerCapacidad(): Promise<Capacidad> {
  if (g.__capacidad) return g.__capacidad;
  const snap = await ref().get();
  contarLecturas(1);
  g.__capacidad = {
    uso: (snap.get("uso") as Capacidad["uso"] | undefined) ?? null,
    limites: (snap.get("limites") as Capacidad["limites"] | undefined) ?? { eu: null, uk: null },
    usoActualizadoEn: (snap.get("usoActualizadoEn") as string | undefined) ?? null,
    limitesActualizadosEn: (snap.get("limitesActualizadosEn") as string | undefined) ?? null,
  };
  return g.__capacidad;
}

async function guardar(c: Capacidad) {
  await ref().set(c);
  contarEscrituras(1);
  g.__capacidad = c;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Sync stage: re-reads the space used when it's over 6 hours old (`forzar`: now). Returns writes done. */
export async function actualizarCapacidad(forzar = false): Promise<number> {
  const c = await obtenerCapacidad();
  if (!forzar && c.usoActualizadoEn && Date.now() - new Date(c.usoActualizadoEn).getTime() < REFRESCO_MS) return 0;
  const [eu, uk] = await Promise.all([espacioOcupado(MERCADO.eu), espacioOcupado(MERCADO.uk)]);
  const uso = { eu: { enAlmacen: r3(eu.enAlmacen), enCamino: r3(eu.enCamino) }, uk: { enAlmacen: r3(uk.enAlmacen), enCamino: r3(uk.enCamino) } };
  await guardar({ ...c, uso, usoActualizadoEn: new Date().toISOString() });
  return 1;
}

/** The month's limit of a region (cubic metres), as Seller Central's Capacity Monitor shows it; null clears it. */
export async function guardarLimiteCapacidad(region: unknown, limite: unknown): Promise<Capacidad> {
  if (region !== "eu" && region !== "uk") throw new Error("Región no válida");
  const valor = limite === null || limite === "" ? null : Number(String(limite).replace(",", "."));
  if (valor !== null && !(Number.isFinite(valor) && valor >= 0 && valor < 100_000)) throw new Error("Escribe el límite en metros cúbicos");
  const c = await obtenerCapacidad();
  const nuevo = { ...c, limites: { ...c.limites, [region]: valor === null ? null : r3(valor) }, limitesActualizadosEn: new Date().toISOString() };
  await guardar(nuevo);
  return nuevo;
}
