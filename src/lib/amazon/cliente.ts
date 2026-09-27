import "server-only";

import { limpiarEnv } from "@/lib/env";

/**
 * Minimal Selling Partner API client: LWA (Login with Amazon) access tokens
 * from the refresh token, plus retries for throttling. Since October 2023 the
 * SP-API needs no AWS IAM role nor SigV4 signing — the LWA token is enough.
 */

const clientId = limpiarEnv(process.env.SPAPI_LWA_CLIENT_ID);
const clientSecret = limpiarEnv(process.env.SPAPI_LWA_CLIENT_SECRET);
const refreshToken = limpiarEnv(process.env.SPAPI_REFRESH_TOKEN);

const HOSTS = {
  eu: "https://sellingpartnerapi-eu.amazon.com",
  na: "https://sellingpartnerapi-na.amazon.com",
  fe: "https://sellingpartnerapi-fe.amazon.com",
} as const;

const region = (limpiarEnv(process.env.SPAPI_REGION) ?? "eu").toLowerCase() as keyof typeof HOSTS;
const host = HOSTS[region] ?? HOSTS.eu;

export const isAmazonConfigured = Boolean(clientId && clientSecret && refreshToken);

export class ErrorAmazon extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let tokenCache: { token: string; caduca: number } | null = null;

async function accessToken(): Promise<string> {
  if (!isAmazonConfigured) {
    throw new Error("Amazon SP-API no está configurada: revisa SPAPI_LWA_CLIENT_ID, SPAPI_LWA_CLIENT_SECRET y SPAPI_REFRESH_TOKEN en .env.local");
  }
  // LWA tokens live 1 h; renew a minute early.
  if (tokenCache && tokenCache.caduca > Date.now() + 60_000) return tokenCache.token;

  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken!,
      client_id: clientId!,
      client_secret: clientSecret!,
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    const detalle = body.error_description ?? body.error ?? `HTTP ${res.status}`;
    throw new ErrorAmazon(`Login with Amazon rechazó las credenciales (${detalle}). Revisa el Client ID, el Client Secret regenerado y el Refresh Token.`, res.status);
  }
  tokenCache = { token: body.access_token, caduca: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

type Params = Record<string, string | number | string[] | undefined>;

/** Longest we are willing to wait for a throttled call inside one sync request. */
const ESPERA_MAXIMA_MS = 60_000;
const REINTENTOS = 5;

/**
 * GET against the SP-API. On 429 (throttled) or 5xx it waits and retries,
 * using the rate the API reports in `x-amzn-RateLimit-Limit` (requests/second)
 * to know how long a fresh token takes to refill.
 */
export async function spGet<T>(ruta: string, params: Params = {}): Promise<T> {
  return spPedir<T>("GET", ruta, params);
}

/** POST with a JSON body (e.g. creating a report), same retries as `spGet`. */
export async function spPost<T>(ruta: string, cuerpo: unknown): Promise<T> {
  return spPedir<T>("POST", ruta, {}, cuerpo);
}

async function spPedir<T>(metodo: "GET" | "POST", ruta: string, params: Params, cuerpoPeticion?: unknown): Promise<T> {
  const url = new URL(ruta, host);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    // SP-API takes array parameters comma-separated.
    url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }

  for (let intento = 0; ; intento++) {
    const res = await fetch(url, {
      method: metodo,
      headers: {
        "x-amz-access-token": await accessToken(),
        "user-agent": "ElectronicVLC-Beneficios/0.1 (Language=TypeScript)",
        accept: "application/json",
        ...(cuerpoPeticion === undefined ? {} : { "content-type": "application/json" }),
      },
      body: cuerpoPeticion === undefined ? undefined : JSON.stringify(cuerpoPeticion),
      cache: "no-store",
    });

    if (res.ok) return (await res.json()) as T;

    const reintentable = res.status === 429 || res.status >= 500;
    if (reintentable && intento < REINTENTOS) {
      const tasa = Number(res.headers.get("x-amzn-ratelimit-limit"));
      const porTasa = tasa > 0 ? 1000 / tasa : 0;
      const espera = Math.max(porTasa, 2000 * 2 ** intento);
      if (espera <= ESPERA_MAXIMA_MS) {
        await new Promise((r) => setTimeout(r, espera));
        continue;
      }
    }

    const cuerpo = (await res.json().catch(() => null)) as { errors?: { code?: string; message?: string; details?: string }[] } | null;
    const e = cuerpo?.errors?.[0];
    const detalle = e ? `${e.code ?? ""} ${e.message ?? ""} ${e.details ?? ""}`.trim() : res.statusText;
    const pista =
      res.status === 403
        ? " — la app no tiene permiso para este rol/API o el refresh token no corresponde a esta región"
        : res.status === 429
          ? " — límite de peticiones de Amazon alcanzado, vuelve a sincronizar en unos minutos"
          : "";
    throw new ErrorAmazon(`${ruta}: HTTP ${res.status} ${detalle}${pista}`, res.status);
  }
}

/** SP-API date parameters must be at least 2 minutes before the request. */
export function ahoraMenos3Min(): Date {
  return new Date(Date.now() - 3 * 60_000);
}
