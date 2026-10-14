import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from "@/lib/auth/session";

/**
 * Exchanges a Firebase ID token for an httpOnly session cookie (14 days). On login the token must be fresh; with
 * `renovar` (the app renewing the session while it's used, or signing back in silently) any valid, unrevoked token
 * of the browser's still signed-in user works: the session lasts as long as the owner doesn't sign out.
 */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  if (!isAdminConfigured) {
    return NextResponse.json({ error: "Firebase Admin no está configurado en el servidor" }, { status: 500 });
  }

  const { idToken, renovar } = (await req.json().catch(() => ({}))) as { idToken?: string; renovar?: boolean };
  if (!idToken) {
    return NextResponse.json({ error: "Falta el token" }, { status: 400 });
  }

  try {
    // A login must be just completed (auth within 5 min). A renewal only needs a valid token whose sign-in wasn't
    // revoked: the browser can only get one while it's still signed in.
    const decoded = await adminAuth().verifyIdToken(idToken, true);
    if (!renovar && Date.now() / 1000 - decoded.auth_time > 5 * 60) {
      return NextResponse.json({ error: "Inicia sesión de nuevo" }, { status: 401 });
    }
    const sessionCookie = await adminAuth().createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS / 1000,
    });
    return res;
  } catch (err) {
    const code = (err as { code?: string }).code ?? "desconocido";
    console.error(`[api/session] No se pudo crear la sesión (${code}):`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }
}

/**
 * Logout of this browser: clears the cookie (the page also signs Firebase out here). It doesn't revoke the user's
 * tokens: that signed out every other device too, whose next save then failed with «Sesión caducada».
 */
export async function DELETE(req: NextRequest) {
  if (!mismoOrigen(req)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
