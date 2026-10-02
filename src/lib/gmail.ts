import "server-only";

import type { NextRequest } from "next/server";
import { guardarGmail, obtenerGmail, type Notificacion } from "@/lib/datos/notificaciones";
import { CONSULTA_GMAIL, esNotificacion } from "@/lib/datos/clasificarNotificaciones";

/*
 * Gmail access (read-only) to collect Amazon's performance notifications.
 * OAuth "web" flow: /api/gmail/conectar → Google → /api/gmail/callback, which
 * stores the refresh token. Messages are then listed with a search query and
 * only new ones are fetched (metadata + snippet).
 */

const ALCANCE = "https://www.googleapis.com/auth/gmail.readonly";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Public URL of this app (behind Railway's proxy the request URL is the internal one). */
export function origenPublico(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export const redirectUri = (req: NextRequest) => `${origenPublico(req)}/api/gmail/callback`;

export function urlAutorizacion(req: NextRequest, estado: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: ALCANCE,
    access_type: "offline",
    // Always ask again, so Google returns a refresh token even if it was granted before.
    prompt: "consent",
    state: estado,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function token(cuerpo: Record<string, string>): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", ...cuerpo }),
    cache: "no-store",
  });
  const b = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
  if (!res.ok || !b.access_token) throw new Error(`Google: ${b.error_description ?? b.error ?? res.status}`);
  return { access_token: b.access_token, refresh_token: b.refresh_token };
}

/** Exchanges the callback code and stores the refresh token and the mailbox address. */
export async function conectar(req: NextRequest, code: string): Promise<void> {
  const t = await token({ code, grant_type: "authorization_code", redirect_uri: redirectUri(req) });
  if (!t.refresh_token) throw new Error("Google no devolvió acceso permanente: vuelve a conectar");
  const perfil = await gmailGet<{ emailAddress?: string }>(t.access_token, "/profile");
  await guardarGmail({ refreshToken: t.refresh_token, email: perfil.emailAddress ?? null, notificaciones: {}, descartados: [], actualizadoEn: null });
}

/** `params` as pairs: Gmail repeats a parameter to pass several values (metadataHeaders). */
async function gmailGet<T>(accessToken: string, ruta: string, params: [string, string][] = []): Promise<T> {
  const res = await fetch(`${API}${ruta}?${new URLSearchParams(params)}`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

type Mensaje = { id: string; snippet?: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } };

/** Fetches Amazon notifications not seen yet. Returns how many were added (0 = nothing written). */
export async function sincronizarGmail(): Promise<number> {
  const doc = await obtenerGmail();
  if (!doc.refreshToken) return 0;
  const { access_token } = await token({ refresh_token: doc.refreshToken, grant_type: "refresh_token" });

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const r = await gmailGet<{ messages?: { id: string }[]; nextPageToken?: string }>(access_token, "/messages", [
      ["q", CONSULTA_GMAIL],
      ["maxResults", "500"],
      ...(pageToken ? ([["pageToken", pageToken]] as [string, string][]) : []),
    ]);
    ids.push(...(r.messages ?? []).map((m) => m.id));
    pageToken = r.nextPageToken;
  } while (pageToken && ids.length < 2000);

  const vistos = new Set(doc.descartados);
  const nuevos = ids.filter((id) => !doc.notificaciones[id] && !vistos.has(id));
  const notificaciones = { ...doc.notificaciones };
  let anadidas = 0;
  for (const id of nuevos) {
    const m = await gmailGet<Mensaje>(access_token, `/messages/${id}`, [
      ["format", "metadata"],
      ["metadataHeaders", "Subject"],
      ["metadataHeaders", "From"],
    ]).catch(() => null);
    if (!m) continue;
    const cabecera = (n: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
    const asunto = cabecera("subject") || "(sin asunto)";
    const remitente = cabecera("from");
    // Other Amazon emails (refunds, invoices, payouts…) are only remembered so they aren't fetched again.
    if (!esNotificacion(asunto, remitente)) {
      vistos.add(id);
      continue;
    }
    const extracto = (m.snippet ?? "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    anadidas++;
    const n: Notificacion = {
      id,
      asunto,
      fecha: new Date(Number(m.internalDate) || Date.now()).toISOString(),
      remitente,
      extracto,
      // What was already there before connecting doesn't count as new.
      leida: doc.actualizadoEn === null,
    };
    notificaciones[id] = n;
  }
  // Written only when something arrived (or on the first look, which also marks the start).
  if (nuevos.length > 0 || doc.actualizadoEn === null) await guardarGmail({ notificaciones, descartados: [...vistos], actualizadoEn: new Date().toISOString() });
  return anadidas;
}

// ---------- Buyer messages (Amazon sends a copy of each one from …@marketplace.amazon.xx) ----------

export type CorreoCliente = {
  id: string;
  fecha: string;
  asunto: string;
  /** Domain of the sending marketplace: "amazon.de"… */
  dominio: string;
  marketplaceId: string | null;
  cliente: string | null;
  pedido: string | null;
  producto: string | null;
  asin: string | null;
  texto: string;
};

type Parte = { mimeType?: string; body?: { data?: string }; parts?: Parte[] };
type CorreoCompleto = { id: string; internalDate?: string; payload?: Parte & { headers?: { name: string; value: string }[] } };

function textoPlano(p: Parte | undefined): string {
  if (!p) return "";
  if (p.mimeType === "text/plain" && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
  for (const q of p.parts ?? []) {
    const t = textoPlano(q);
    if (t) return t;
  }
  return "";
}

/** Reads one buyer-message email: the order, the product, the buyer's text between Amazon's dashed lines. */
function leerCorreoCliente(m: CorreoCompleto): CorreoCliente {
  const cabecera = (n: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
  const asunto = cabecera("subject");
  const remitente = cabecera("from");
  const cuerpo = textoPlano(m.payload).replace(/\r/g, "");
  const lineas = cuerpo.split("\n");
  const guiones = lineas.map((l, i) => (/^-{5,}.*-{5,}\s*$/.test(l.trim()) ? i : -1)).filter((i) => i >= 0);
  const texto = (guiones.length >= 2 ? lineas.slice(guiones[0] + 1, guiones[1]) : lineas.slice(0, 40)).join("\n").trim();
  const producto = cuerpo.match(/^\s*\d+\s*\/\s*(.+?)\s*\[ASIN:\s*([A-Z0-9]{10})\]/m);
  return {
    id: m.id,
    fecha: new Date(Number(m.internalDate) || Date.now()).toISOString(),
    asunto,
    dominio: remitente.match(/@marketplace\.(amazon\.[a-z.]+)/i)?.[1]?.toLowerCase() ?? "",
    marketplaceId: cuerpo.match(/[?&]mp=([A-Z0-9]{9,14})/)?.[1] ?? null,
    cliente: asunto.match(/(?:Amazon-Kunde|client Amazon|cliente de Amazon|cliente Amazon|Amazon customer|cliente Amazon)\s+([^()]+?)\s*(?:\(|$)/i)?.[1]?.trim() ?? null,
    pedido: cuerpo.match(/#\s*(\d{3}-\d{7}-\d{7})/)?.[1] ?? asunto.match(/(\d{3}-\d{7}-\d{7})/)?.[1] ?? null,
    producto: producto?.[1] ?? null,
    asin: producto?.[2] ?? null,
    texto: texto.slice(0, 5000),
  };
}

/** Buyer messages of the last year not in `conocidos` (at most 60 per call, newest first). */
export async function correosClientesNuevos(conocidos: Set<string>): Promise<CorreoCliente[]> {
  const doc = await obtenerGmail();
  if (!doc.refreshToken) return [];
  const { access_token } = await token({ refresh_token: doc.refreshToken, grant_type: "refresh_token" });
  const r = await gmailGet<{ messages?: { id: string }[] }>(access_token, "/messages", [
    ["q", "from:marketplace.amazon newer_than:365d"],
    ["maxResults", "500"],
  ]);
  const nuevos = (r.messages ?? []).map((m) => m.id).filter((id) => !conocidos.has(id)).slice(0, 60);
  const res: CorreoCliente[] = [];
  for (const id of nuevos) {
    const m = await gmailGet<CorreoCompleto>(access_token, `/messages/${id}`, [["format", "full"]]).catch(() => null);
    if (m) res.push(leerCorreoCliente(m));
  }
  return res;
}
