import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from "@/lib/auth/session";

/** Exchanges a fresh Firebase ID token for an httpOnly session cookie. */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  if (!isAdminConfigured) {
    return NextResponse.json({ error: "Firebase Admin no está configurado en el servidor" }, { status: 500 });
  }

  const { idToken } = (await req.json().catch(() => ({}))) as { idToken?: string };
  if (!idToken) {
    return NextResponse.json({ error: "Falta el token" }, { status: 400 });
  }

  try {
    // Rejects tokens older than 5 min, so only a just-completed login can create a session.
    const decoded = await adminAuth().verifyIdToken(idToken, true);
    if (Date.now() / 1000 - decoded.auth_time > 5 * 60) {
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

/** Logout: revokes refresh tokens and clears the cookie. */
export async function DELETE(req: NextRequest) {
  if (!mismoOrigen(req)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && isAdminConfigured) {
    try {
      const decoded = await adminAuth().verifySessionCookie(cookie);
      await adminAuth().revokeRefreshTokens(decoded.sub);
    } catch {
      // Cookie already invalid — just clear it.
    }
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
