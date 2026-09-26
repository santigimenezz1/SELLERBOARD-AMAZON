import "server-only";

import { adminDb } from "@/lib/firebase/admin";

/**
 * EUR value of one unit of `moneda` on a given day, from the ECB reference
 * rates (served free and keyless by frankfurter.dev). Weekends and holidays
 * get the previous business day's rate. Past days are cached in Firestore
 * (`tiposCambio/{YYYY-MM-DD}`) since they never change.
 */

const memoria = new Map<string, Record<string, number>>();

async function tiposDelDia(dia: string): Promise<Record<string, number>> {
  const enMemoria = memoria.get(dia);
  if (enMemoria) return enMemoria;

  const ref = adminDb().collection("tiposCambio").doc(dia);
  const snap = await ref.get();
  if (snap.exists) {
    const rates = snap.get("rates") as Record<string, number>;
    memoria.set(dia, rates);
    return rates;
  }

  const res = await fetch(`https://api.frankfurter.dev/v1/${dia}?base=EUR`, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo obtener el tipo de cambio del ${dia} (HTTP ${res.status})`);
  const body = (await res.json()) as { date: string; rates: Record<string, number> };
  memoria.set(dia, body.rates);
  // Today's rate is published mid-afternoon; only cache days that are final.
  const hoy = new Date().toISOString().slice(0, 10);
  if (dia < hoy) await ref.set({ fechaBCE: body.date, rates: body.rates });
  return body.rates;
}

export async function eurPorUnidad(moneda: string, fecha: Date): Promise<number> {
  if (moneda === "EUR") return 1;
  const rates = await tiposDelDia(fecha.toISOString().slice(0, 10));
  const porEur = rates[moneda];
  if (!porEur) throw new Error(`El BCE no publica tipo de cambio para ${moneda}`);
  return 1 / porEur;
}
