import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: bounces visitors without a session cookie to /login
// before any page renders. The real verification happens server-side in
// requireUser() (src/lib/auth/session.ts).
const SESSION_COOKIE = "__session";

export function proxy(req: NextRequest) {
  if (!req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the login page, the session endpoint and static assets.
  matcher: ["/((?!login|api/session|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
