import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

/*
 * Counts this app's Firestore reads and writes per quota day, so the panel can
 * show how far it is from the free Spark limits (50,000 reads and 20,000
 * writes a day). Every Firestore call in the app reports here.
 *
 * Counters live in memory and are flushed as increments to `consumo/{día}`
 * (at most one write every 10 minutes, plus one at the end of each sync), so
 * the day's total survives server restarts. The Firebase console remains the
 * authoritative figure; this is the early warning.
 */

export const LIMITE_LECTURAS = 50_000;
export const LIMITE_ESCRITURAS = 20_000;

/** Google resets the free quota at midnight Pacific time. */
const diaCuota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());

type Estado = { dia: string; base: { lecturas: number; escrituras: number } | null; pendiente: { lecturas: number; escrituras: number }; ultimoVolcado: number };
const g = globalThis as unknown as { __consumo?: Estado };

function estado(): Estado {
  const hoy = diaCuota();
  if (!g.__consumo || g.__consumo.dia !== hoy) {
    g.__consumo = { dia: hoy, base: null, pendiente: { lecturas: 0, escrituras: 0 }, ultimoVolcado: Date.now() };
  }
  return g.__consumo;
}

/** A query that returns nothing is still billed as one read. */
export function contarLecturas(n: number) {
  estado().pendiente.lecturas += Math.max(1, n);
}

export function contarEscrituras(n: number) {
  if (n > 0) estado().pendiente.escrituras += n;
}

/** Persists the pending counts (one increment write). `forzar` skips the 10-minute throttle. */
export async function volcarConsumo(forzar = false) {
  const e = estado();
  const { lecturas, escrituras } = e.pendiente;
  if (lecturas === 0 && escrituras === 0) return;
  if (!forzar && Date.now() - e.ultimoVolcado < 10 * 60_000) return;
  e.pendiente = { lecturas: 0, escrituras: 0 };
  e.ultimoVolcado = Date.now();
  // The increment is itself a write: +1, counted here rather than through contarEscrituras.
  if (e.base) e.base = { lecturas: e.base.lecturas + lecturas, escrituras: e.base.escrituras + escrituras + 1 };
  await adminDb()
    .collection("consumo")
    .doc(e.dia)
    .set({ lecturas: FieldValue.increment(lecturas), escrituras: FieldValue.increment(escrituras + 1) }, { merge: true });
}

/** Today's reads and writes (persisted + pending). Reads the day's doc once per process and day. */
export async function consumoDeHoy(): Promise<{ lecturas: number; escrituras: number }> {
  const e = estado();
  if (!e.base) {
    const snap = await adminDb().collection("consumo").doc(e.dia).get();
    contarLecturas(1);
    e.base = { lecturas: (snap.get("lecturas") as number | undefined) ?? 0, escrituras: (snap.get("escrituras") as number | undefined) ?? 0 };
  }
  await volcarConsumo();
  return { lecturas: e.base.lecturas + e.pendiente.lecturas, escrituras: e.base.escrituras + e.pendiente.escrituras };
}
