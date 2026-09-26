import type { NextRequest } from "next/server";

/**
 * CSRF guard for mutating API routes: the browser's Origin must be this same
 * site. Behind a proxy (Railway) the server itself listens on e.g.
 * localhost:8080, so `req.nextUrl.origin` is not the public address — compare
 * the Origin's host with the host the request was actually sent to
 * (X-Forwarded-Host / Host) instead.
 */
export function mismoOrigen(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let hostOrigen: string;
  try {
    hostOrigen = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = [req.headers.get("x-forwarded-host")?.split(",")[0].trim(), req.headers.get("host"), req.nextUrl.host];
  return hosts.some((h) => h && h === hostOrigen);
}
