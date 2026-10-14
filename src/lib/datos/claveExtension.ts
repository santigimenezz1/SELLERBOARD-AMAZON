import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * The key of the review-recorder browser extension: it sends the reviews it recorded without the owner's session
 * cookie (it runs on Amazon's pages), so it signs with this key instead. One key, in `config/extensionResenas`;
 * making a new one stops the old.
 */

const g = globalThis as unknown as { __claveExtension?: string | null };
const ref = () => adminDb().collection("config").doc("extensionResenas");

async function leer(): Promise<string | null> {
  if (g.__claveExtension) return g.__claveExtension;
  // Without a key it's read again next time (it may have been made since); a key, once read, stays in memory.
  const snap = await ref().get();
  contarLecturas(1);
  g.__claveExtension = (snap.get("clave") as string | undefined) ?? null;
  return g.__claveExtension;
}

/** The current key, made the first time it's asked for. With `nueva`, a fresh one replaces it. */
export async function claveExtension(nueva = false): Promise<string> {
  const actual = await leer();
  if (actual && !nueva) return actual;
  const clave = randomBytes(24).toString("base64url");
  await ref().set({ clave, creadaEn: new Date().toISOString() });
  contarEscrituras(1);
  g.__claveExtension = clave;
  return clave;
}

/** Does the request carry the extension's key (`Authorization: Bearer <key>`)? */
export async function claveValida(cabecera: string | null): Promise<boolean> {
  const recibida = (cabecera ?? "").replace(/^Bearer\s+/i, "").trim();
  const clave = await leer();
  if (!clave || recibida.length !== clave.length) return false;
  return timingSafeEqual(Buffer.from(recibida), Buffer.from(clave));
}
