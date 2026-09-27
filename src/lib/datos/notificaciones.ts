import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * Amazon's performance notifications, read from the seller's Gmail (Amazon
 * emails each one; there is no API for them). The OAuth refresh token and the
 * notifications live in `config/gmail` (server-only: Firestore rules deny
 * client access). Read/unread is this app's own flag.
 */

export type Notificacion = {
  id: string;
  asunto: string;
  fecha: string;
  remitente: string;
  /** Marketplace the notification is about (from the text or the sender's domain); null = whole account. */
  marketplaceId: string | null;
  extracto: string;
  leida: boolean;
};
type Doc = { refreshToken: string | null; email: string | null; notificaciones: Record<string, Notificacion>; actualizadoEn: string | null };

const g = globalThis as unknown as { __gmail?: Doc };
const ref = () => adminDb().collection("config").doc("gmail");

export const gmailConfigurado = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export async function obtenerGmail(): Promise<Doc> {
  if (g.__gmail) return g.__gmail;
  const snap = await ref().get();
  contarLecturas(1);
  g.__gmail = {
    refreshToken: (snap.get("refreshToken") as string | undefined) ?? null,
    email: (snap.get("email") as string | undefined) ?? null,
    notificaciones: (snap.get("notificaciones") as Doc["notificaciones"] | undefined) ?? {},
    actualizadoEn: (snap.get("actualizadoEn") as string | undefined) ?? null,
  };
  return g.__gmail;
}

export async function guardarGmail(cambio: Partial<Doc>): Promise<Doc> {
  const doc = { ...(await obtenerGmail()), ...cambio };
  await ref().set(doc);
  contarEscrituras(1);
  g.__gmail = doc;
  return doc;
}

/** Public view for the page: never the token. */
export async function estadoNotificaciones() {
  const d = await obtenerGmail();
  return {
    configurado: gmailConfigurado,
    conectado: Boolean(d.refreshToken),
    email: d.email,
    actualizadoEn: d.actualizadoEn,
    notificaciones: Object.values(d.notificaciones).sort((a, b) => b.fecha.localeCompare(a.fecha)),
  };
}
export type EstadoNotificaciones = Awaited<ReturnType<typeof estadoNotificaciones>>;
