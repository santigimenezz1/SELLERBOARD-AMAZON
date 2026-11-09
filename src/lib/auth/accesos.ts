import "server-only";

import { adminDb } from "@/lib/firebase/admin";

/*
 * Who sees what. The owners (their uids in `config/accesos`) see the whole app. Anyone else who signs in is a guest:
 * «Análisis H10» with their own studies, and the owners' sections as an empty demo (each of those pages loads nothing
 * for a guest: lib/auth/demo.ts), but none of the owners' data or routes (sales, costs, stock, messages, documents,
 * the chat, the extension…). Deny by default: a new user is a guest until added as an owner.
 *
 * Temporary: one app with guests. The clean way is a separate copy of the app with its own database.
 */

export type Rol = "dueno" | "invitado";

const g = globalThis as unknown as { __duenos?: { uids: Set<string>; hasta: number } };
const VIGENCIA_MS = 60_000;

/** The owners' uids (kept in memory a minute). No list yet = everyone is an owner, as before guests existed. */
async function duenos(): Promise<Set<string> | null> {
  if (g.__duenos && g.__duenos.hasta > Date.now()) return g.__duenos.uids;
  const d = await adminDb().collection("config").doc("accesos").get();
  const uids = (d.get("duenos") as string[] | undefined) ?? null;
  if (!uids?.length) return null;
  g.__duenos = { uids: new Set(uids), hasta: Date.now() + VIGENCIA_MS };
  return g.__duenos.uids;
}

export async function rolDe(uid: string): Promise<Rol> {
  const lista = await duenos();
  return !lista || lista.has(uid) ? "dueno" : "invitado";
}

/**
 * The owners' sections a guest may open as an empty demo: only these exact pages, each of which loads nothing for a
 * guest (modoDemo). Their subpages (a product's card…) and every data route stay closed.
 */
const PAGINAS_DEMO = new Set(["/", "/productos", "/stock", "/gastos", "/tendencias", "/vine", "/mensajes", "/documentos", "/variantes", "/cuenta"]);

/**
 * What a guest may open: the «Análisis H10» pages and the study routes (not the test bench, which spends AI
 * credits), the demo pages, and signing in or out. Everything else is the owners' data.
 */
export function rutaDeInvitado(ruta: string): boolean {
  return (
    PAGINAS_DEMO.has(ruta) ||
    ruta === "/analisis-h10" ||
    ruta.startsWith("/analisis-h10/") ||
    ruta === "/api/h10/estudios" ||
    ruta.startsWith("/api/h10/estudios/") ||
    ruta === "/login" ||
    ruta.startsWith("/api/session")
  );
}
