import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { diaMadrid } from "@/lib/datos/fechas";
import { contarEscrituras, contarLecturas } from "@/lib/datos/consumo";
import type { SessionUser } from "./session";

/*
 * Guests' use of the AI is paid with the owners' credits: each guest gets a daily cap on what calls it (reading an
 * uploaded file, and the analyses: reviews by star, grouping themes, translating). The owners have none. Kept in
 * `usoIAInvitados/{uid}`: the day and what was used.
 */

const LIMITES = { archivo: 150, analisis: 10 } as const;
export type UsoIA = keyof typeof LIMITES;

/** Counts one use; null when allowed, else what to tell the guest. */
export async function permitirIA(user: SessionUser, uso: UsoIA): Promise<string | null> {
  if (user.rol !== "invitado") return null;
  const db = adminDb();
  const ref = db.collection("usoIAInvitados").doc(user.uid);
  const hoy = diaMadrid(new Date());
  const respuesta = await db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() as { dia?: string; usos?: Partial<Record<UsoIA, number>> } | undefined;
    const usos = d?.dia === hoy ? (d.usos ?? {}) : {};
    if ((usos[uso] ?? 0) >= LIMITES[uso]) return `Has llegado al límite de hoy (${LIMITES[uso]} ${uso === "archivo" ? "archivos leídos con IA" : "análisis con IA"}). Mañana puedes seguir.`;
    tx.set(ref, { dia: hoy, usos: { ...usos, [uso]: (usos[uso] ?? 0) + 1 } });
    return null;
  });
  contarLecturas(1);
  if (!respuesta) contarEscrituras(1);
  return respuesta;
}
