import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { contarEscrituras, contarLecturas } from "./consumo";
import { esNotificacion, mercadosDe } from "./clasificarNotificaciones";

/*
 * Amazon's performance notifications, read from the seller's Gmail (Amazon
 * emails each one; there is no API for them). The OAuth refresh token and the
 * notifications live in `config/gmail` (server-only: Firestore rules deny
 * client access). Read/unread is this app's own flag.
 */

export type Notificacion = { id: string; asunto: string; fecha: string; remitente: string; extracto: string; leida: boolean };
/** `descartados`: ids of Amazon emails already looked at that aren't performance notifications (not fetched again). */
type Doc = {
  version: number;
  refreshToken: string | null;
  email: string | null;
  notificaciones: Record<string, Notificacion>;
  descartados: string[];
  actualizadoEn: string | null;
};
/** Bumped when the selection rules change: the notifications are then read again from Gmail. */
export const VERSION_NOTIFICACIONES = 2;

const g = globalThis as unknown as { __gmailV2?: Doc };
const ref = () => adminDb().collection("config").doc("gmail");

export const gmailConfigurado = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export async function obtenerGmail(): Promise<Doc> {
  if (g.__gmailV2) return g.__gmailV2;
  const snap = await ref().get();
  contarLecturas(1);
  const vigente = snap.get("version") === VERSION_NOTIFICACIONES;
  g.__gmailV2 = {
    version: VERSION_NOTIFICACIONES,
    refreshToken: (snap.get("refreshToken") as string | undefined) ?? null,
    email: (snap.get("email") as string | undefined) ?? null,
    // Older rules: start over (the next read marks what's already there as read, as on connecting).
    notificaciones: vigente ? ((snap.get("notificaciones") as Doc["notificaciones"] | undefined) ?? {}) : {},
    descartados: vigente ? ((snap.get("descartados") as string[] | undefined) ?? []) : [],
    actualizadoEn: vigente ? ((snap.get("actualizadoEn") as string | undefined) ?? null) : null,
  };
  return g.__gmailV2;
}

export async function guardarGmail(cambio: Partial<Doc>): Promise<Doc> {
  const doc = { ...(await obtenerGmail()), ...cambio };
  await ref().set(doc);
  contarEscrituras(1);
  g.__gmailV2 = doc;
  return doc;
}

/** Public view for the page (never the token), each notification with the countries that list it. */
export async function estadoNotificaciones() {
  const d = await obtenerGmail();
  return {
    configurado: gmailConfigurado,
    conectado: Boolean(d.refreshToken),
    email: d.email,
    actualizadoEn: d.actualizadoEn,
    notificaciones: Object.values(d.notificaciones)
      .filter((n) => esNotificacion(n.asunto, n.remitente))
      .map((n) => ({ ...n, mercados: mercadosDe(n.asunto, n.remitente) }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha)),
  };
}
export type EstadoNotificaciones = Awaited<ReturnType<typeof estadoNotificaciones>>;
