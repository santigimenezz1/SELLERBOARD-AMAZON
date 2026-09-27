import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import type { Pedido } from "@/lib/datos/tipos";
import { pedidosEnAlmacen } from "@/lib/datos/almacen";
import { ETIQUETAS_POR_ASIN } from "@/lib/datos/etiquetas";
import { diaMadrid } from "@/lib/datos/fechas";
import { contarEscrituras, contarLecturas } from "@/lib/datos/consumo";
import { formatNumero } from "@/lib/format";

/*
 * Sales notices on the seller's phone through their own Telegram bot
 * (TELEGRAM_BOT_TOKEN). The chat to write to is the one that messaged the bot
 * first (found with getUpdates once and kept in `config/telegram`), unless
 * TELEGRAM_CHAT_ID fixes it. A dedicated chat lets the phone give sales their
 * own ringtone.
 */

const token = () => process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
export const telegramConfigurado = () => /^\d+:[\w-]{30,}$/.test(token());

/** A batch bigger than this is summed up in one message instead of one per order. */
const MAX_MENSAJES = 5;

const g = globalThis as unknown as { __telegramChat?: string | null };

async function api<T>(metodo: string, cuerpo?: object): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${metodo}`, {
    method: cuerpo ? "POST" : "GET",
    headers: cuerpo ? { "Content-Type": "application/json" } : undefined,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    cache: "no-store",
  });
  const b = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!b.ok) throw new Error(b.description ?? `HTTP ${res.status}`);
  return b.result as T;
}

/** The seller's chat id: env, then Firestore, then the first private chat that wrote to the bot. */
async function chatId(): Promise<string | null> {
  if (process.env.TELEGRAM_CHAT_ID) return process.env.TELEGRAM_CHAT_ID;
  if (g.__telegramChat) return g.__telegramChat;
  const ref = adminDb().collection("config").doc("telegram");
  const guardado = (await ref.get()).get("chatId") as string | undefined;
  contarLecturas(1);
  if (guardado) return (g.__telegramChat = guardado);
  const updates = await api<{ message?: { chat?: { id: number; type: string } } }[]>("getUpdates");
  const chat = updates.map((u) => u.message?.chat).find((c) => c?.type === "private");
  if (!chat) return null;
  g.__telegramChat = String(chat.id);
  await ref.set({ chatId: g.__telegramChat, conectadoEn: new Date().toISOString() });
  contarEscrituras(1);
  return g.__telegramChat;
}

export async function enviarTelegram(texto: string): Promise<boolean> {
  if (!telegramConfigurado()) return false;
  const chat = await chatId();
  if (!chat) throw new Error("el bot aún no tiene tu chat: escríbele «hola» en Telegram");
  await api("sendMessage", { chat_id: chat, text: texto, parse_mode: "HTML", disable_web_page_preview: true });
  return true;
}

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const nombreProducto = (l: Pedido) => ETIQUETAS_POR_ASIN[l.asin] ?? (l.titulo.trim().length > 1 ? l.titulo.slice(0, 40) : l.sku || l.asin);

/** Units sold today (Madrid), from the in-memory orders. */
function unidadesHoy(): number {
  const hoy = diaMadrid(new Date());
  let unidades = 0;
  for (const p of pedidosEnAlmacen().values()) if (p.estado !== "CANCELLED" && diaMadrid(p.fecha) === hoy) unidades += p.unidades;
  return unidades;
}

const uds = (n: number) => `${formatNumero(n)} ${n === 1 ? "unidad" : "unidades"}`;
const unidadesDe = (ls: Pedido[]) => ls.reduce((s, l) => s + l.unidades, 0);

/**
 * Notice of the orders the sync has just seen for the first time: one message per order (or one for all when
 * many arrive at once) with the units, the listing and today's units so far. No prices, by choice.
 */
export async function avisarVentas(lineas: Pedido[]): Promise<void> {
  if (!telegramConfigurado()) return;
  const porPedido = new Map<string, Pedido[]>();
  for (const l of lineas) if (l.estado !== "CANCELLED") porPedido.set(l.amazonOrderId, [...(porPedido.get(l.amazonOrderId) ?? []), l]);
  if (porPedido.size === 0) return;
  const pie = `\nHoy llevas ${uds(unidadesHoy())}`;
  const listings = (ls: Pedido[]) => [...new Set(ls.map(nombreProducto))].map(escapar).join(" + ");

  if (porPedido.size > MAX_MENSAJES) {
    const todas = [...porPedido.values()].flat();
    // Units per listing, e.g. "LISTING VIEJO: 3 · LISTING NUEVO: 1".
    const porListing = new Map<string, number>();
    for (const l of todas) porListing.set(nombreProducto(l), (porListing.get(nombreProducto(l)) ?? 0) + l.unidades);
    const detalle = [...porListing].map(([n, u]) => `${escapar(n)}: ${formatNumero(u)}`).join(" · ");
    await enviarTelegram(`🛒 <b>¡Nuevas ventas! ${uds(unidadesDe(todas))}</b>\n${detalle}${pie}`);
    return;
  }
  for (const ls of porPedido.values()) await enviarTelegram(`🛒 <b>¡Nueva venta! ${uds(unidadesDe(ls))}</b>\n${listings(ls)}${pie}`);
}
