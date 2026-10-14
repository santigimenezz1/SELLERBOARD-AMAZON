"use client";

import { clientAuth, isFirebaseConfigured } from "@/lib/firebase/client";

/**
 * Renews the server session (another 14 days) with the browser's Firebase sign-in, which Firebase keeps until the
 * owner signs out. True when there's a signed-in user and the server took it.
 */
export async function renovarSesion(): Promise<boolean> {
  if (!isFirebaseConfigured) return false;
  const auth = clientAuth();
  await auth.authStateReady();
  const usuario = auth.currentUser;
  if (!usuario) return false;
  try {
    const idToken = await usuario.getIdToken();
    const r = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken, renovar: true }) });
    return r.ok;
  } catch {
    return false;
  }
}
