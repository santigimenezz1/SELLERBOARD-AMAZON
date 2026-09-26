import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";

export const SESSION_COOKIE = "__session";
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14; // 14 días (máximo de Firebase)

export type SessionUser = { uid: string; email: string | null };

/**
 * Verifies the httpOnly session cookie. Cached per request.
 *
 * The signature and expiry are always checked locally. `comprobarRevocacion`
 * adds a round trip to Firebase (~180 ms) to reject sessions revoked by a
 * logout elsewhere or a disabled account: used by the routes that CHANGE data
 * (import, edit, delete); plain page views skip it to load faster.
 */
export const getSessionUser = cache(async (comprobarRevocacion: boolean = false): Promise<SessionUser | null> => {
  // Read cookies first so every page using this is always rendered per-request.
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie || !isAdminConfigured) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, comprobarRevocacion);
    return { uid: decoded.uid, email: decoded.email ?? null };
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
