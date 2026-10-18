import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";
import { rolDe, rutaDeInvitado, type Rol } from "./accesos";

export const SESSION_COOKIE = "__session";
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14; // 14 días (máximo de Firebase)
/** The path being served, set by the proxy (src/proxy.ts) on every request: whatever the browser sent is replaced. */
export const CABECERA_RUTA = "x-ruta";

/** `rol`: an owner sees everything; a guest only «Análisis H10» (see accesos.ts). */
export type SessionUser = { uid: string; email: string | null; rol: Rol };

/**
 * Verifies the httpOnly session cookie. Cached per request.
 *
 * The signature and expiry are always checked locally. `comprobarRevocacion`
 * adds a round trip to Firebase (~180 ms) to reject sessions revoked by a
 * logout elsewhere or a disabled account: used by the routes that CHANGE data
 * (import, edit, delete); plain page views skip it to load faster.
 *
 * A guest outside the paths it may open gets no user at all, so every page and route that asks for one turns it
 * away (the proxy already redirects it; this is the second lock).
 */
export const getSessionUser = cache(async (comprobarRevocacion: boolean = false): Promise<SessionUser | null> => {
  // Read cookies first so every page using this is always rendered per-request.
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie || !isAdminConfigured) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, comprobarRevocacion);
    const rol = await rolDe(decoded.uid);
    if (rol === "invitado" && !rutaDeInvitado((await headers()).get(CABECERA_RUTA) ?? "")) return null;
    return { uid: decoded.uid, email: decoded.email ?? null, rol };
  } catch {
    return null;
  }
});

/** Use at the top of every protected server component / route. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
