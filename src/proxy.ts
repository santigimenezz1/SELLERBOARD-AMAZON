import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, isAdminConfigured } from "@/lib/firebase/admin";
import { rolDe, rutaDeInvitado } from "@/lib/auth/accesos";

// Bounces visitors without a session cookie to /login before any page renders, and keeps guests (accesos.ts) inside
// «Análisis H10»: another page sends them there, another route answers 403. The real verification happens
// server-side in getSessionUser() (src/lib/auth/session.ts), which also gets the path served from here.
const SESSION_COOKIE = "__session";
const CABECERA_RUTA = "x-ruta";

export async function proxy(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!cookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  const ruta = req.nextUrl.pathname;
  if (isAdminConfigured) {
    try {
      const { uid } = await adminAuth().verifySessionCookie(cookie);
      if ((await rolDe(uid)) === "invitado" && !rutaDeInvitado(ruta)) {
        if (ruta.startsWith("/api/")) return NextResponse.json({ error: "No disponible en esta cuenta" }, { status: 403 });
        const url = req.nextUrl.clone();
        url.pathname = "/analisis-h10";
        url.search = "";
        return NextResponse.redirect(url);
      }
    } catch {
      // A bad or expired cookie: the page itself sends it to /login.
    }
  }
  // The path, for getSessionUser(); whatever the browser sent in this header is replaced.
  const cabeceras = new Headers(req.headers);
  cabeceras.set(CABECERA_RUTA, ruta);
  return NextResponse.next({ request: { headers: cabeceras } });
}

export const config = {
  // Everything except the login page, the session endpoint, the scheduled sync and the review extension (each with
  // its own key) and static assets.
  matcher: ["/((?!login|api/session|api/cron|api/extension/resenas|api/extension/destino|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
