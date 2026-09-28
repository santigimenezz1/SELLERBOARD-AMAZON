import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import type { Pedido } from "@/lib/datos/tipos";
import { pedidosEnAlmacen } from "@/lib/datos/almacen";
import { ETIQUETAS_POR_ASIN } from "@/lib/datos/etiquetas";
import { marketplaceConocido } from "@/lib/datos/marketplacesConocidos";
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

/**
 * One message per sale, so each one rings. Beyond this many at once (e.g. after the app was down a while) the
 * rest go in one last message.
 */
const MAX_MENSAJES = 20;
/** Gap between messages so the phone rings for each, 2 s apart (Telegram allows ~1 message/s per chat). */
const PAUSA_MS = 2000;

const g = globalThis as unknown as { __telegramChat?: string | null; __telegramAlertas?: string | null };

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

type Chat = { id: number; type: string; title?: string };
type Actualizacion = { message?: { chat?: Chat; migrate_to_chat_id?: number }; my_chat_member?: { chat?: Chat } };

/**
 * The group for account alerts (its own chat, so the phone can give it its own sound): env, then Firestore,
 * then the latest group the bot was added to or written in. null = no group yet (alerts go to the sales chat).
 */
async function chatAlertas(): Promise<string | null> {
  if (process.env.TELEGRAM_CHAT_ALERTAS) return process.env.TELEGRAM_CHAT_ALERTAS;
  if (g.__telegramAlertas) return g.__telegramAlertas;
  const ref = adminDb().collection("config").doc("telegram");
  const guardado = (await ref.get()).get("chatAlertas") as string | undefined;
  contarLecturas(1);
  if (guardado) return (g.__telegramAlertas = guardado);
  const updates = await api<Actualizacion[]>("getUpdates");
  const grupo = updates
    .flatMap((u) => [u.message?.migrate_to_chat_id ? { id: u.message.migrate_to_chat_id, type: "supergroup" } : null, u.message?.chat, u.my_chat_member?.chat])
    .filter((c): c is Chat => !!c && (c.type === "group" || c.type === "supergroup"))
    .at(-1);
  if (!grupo) return null;
  g.__telegramAlertas = String(grupo.id);
  await ref.set({ chatAlertas: g.__telegramAlertas, alertasConectadoEn: new Date().toISOString() }, { merge: true });
  contarEscrituras(1);
  return g.__telegramAlertas;
}

/** `destino` "alertas": the account-alerts group when there is one, otherwise the sales chat. */
export async function enviarTelegram(texto: string, destino: "ventas" | "alertas" = "ventas"): Promise<boolean> {
  if (!telegramConfigurado()) return false;
  const chat = (destino === "alertas" ? await chatAlertas() : null) ?? (await chatId());
  if (!chat) throw new Error("el bot aún no tiene tu chat: escríbele «hola» en Telegram");
  try {
    await api("sendMessage", { chat_id: chat, text: texto, parse_mode: "HTML", disable_web_page_preview: true });
  } catch (e) {
    // A group that became a supergroup gets a new id: Telegram says which one; keep it and retry.
    const nuevo = e instanceof Error ? e.message.match(/migrated to a supergroup with id (-?\d+)/i)?.[1] : null;
    if (!nuevo || destino !== "alertas") throw e;
    g.__telegramAlertas = nuevo;
    await adminDb().collection("config").doc("telegram").set({ chatAlertas: nuevo }, { merge: true });
    contarEscrituras(1);
    await api("sendMessage", { chat_id: nuevo, text: texto, parse_mode: "HTML", disable_web_page_preview: true });
  }
  return true;
}

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** "ES" → 🇪🇸 */
const bandera = (codigo: string) => (/^[A-Z]{2}$/i.test(codigo) ? String.fromCodePoint(...[...codigo.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "");
/** Marketplace of the sale, e.g. "🇪🇸 España". */
function mercado(l: Pedido): string {
  const mk = marketplaceConocido(l.marketplaceId);
  return mk ? `${bandera(mk.codigoPais)} ${escapar(mk.pais)}` : escapar(l.pais);
}
const nombreProducto = (l: Pedido) => ETIQUETAS_POR_ASIN[l.asin] ?? (l.titulo.trim().length > 1 ? l.titulo.slice(0, 40) : l.sku || l.asin);

const uds = (n: number) => `${formatNumero(n)} ${n === 1 ? "unidad" : "unidades"}`;
const unidadesDe = (ls: Pedido[]) => ls.reduce((s, l) => s + l.unidades, 0);

/**
 * Today's (Madrid) orders in the order they were placed, each with its number of the day and the units sold
 * up to and including it, from the in-memory orders.
 */
function ventasDeHoy(): Map<string, { numero: number; acumuladas: number }> {
  const hoy = diaMadrid(new Date());
  const porPedido = new Map<string, { fecha: number; unidades: number }>();
  for (const p of pedidosEnAlmacen().values()) {
    if (p.estado === "CANCELLED" || diaMadrid(p.fecha) !== hoy) continue;
    const v = porPedido.get(p.amazonOrderId) ?? { fecha: p.fecha.getTime(), unidades: 0 };
    v.unidades += p.unidades;
    porPedido.set(p.amazonOrderId, v);
  }
  const res = new Map<string, { numero: number; acumuladas: number }>();
  let acumuladas = 0;
  [...porPedido.entries()]
    .sort((a, b) => a[1].fecha - b[1].fecha)
    .forEach(([id, v], i) => {
      acumuladas += v.unidades;
      res.set(id, { numero: i + 1, acumuladas });
    });
  return res;
}

export type CambioPuntuacion = { marketplaceId: string; antes: number | null; ahora: number };

/**
 * Account health crossing the «Adecuado» line (200 points) in a marketplace: a red notice when it drops below,
 * a green one when it's back. One message per change, sent only when it happens, to the alerts group.
 */
export async function avisarEstadoCuenta(cambios: CambioPuntuacion[]): Promise<void> {
  if (!telegramConfigurado()) return;
  for (const [i, c] of cambios.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, PAUSA_MS));
    const mk = marketplaceConocido(c.marketplaceId);
    const pais = mk ? `${bandera(mk.codigoPais)} ${escapar(mk.pais)}` : escapar(c.marketplaceId);
    const antes = c.antes !== null ? ` (antes ${formatNumero(c.antes)})` : "";
    await enviarTelegram(
      c.ahora < 200
        ? `🔴 <b>¡Estado de la cuenta en riesgo!</b>\n${pais} ha bajado a <b>${formatNumero(c.ahora)} puntos</b>${antes}\nRevisa «Estado de la cuenta» en la app o en Seller Central.`
        : `🟢 <b>Estado de la cuenta recuperado</b>\n${pais} ha vuelto a <b>${formatNumero(c.ahora)} puntos</b>${antes}`,
      "alertas",
    );
  }
}

/**
 * Notice of the orders the sync has just seen for the first time: one message per order, a moment apart, so
 * the phone rings for each. Each says which sale of the day it is, its units, listing and marketplace, and the units sold
 * today up to it. No prices, by choice. Beyond MAX_MENSAJES at once the rest come in one last message.
 */
export async function avisarVentas(lineas: Pedido[]): Promise<void> {
  if (!telegramConfigurado()) return;
  const porPedido = new Map<string, Pedido[]>();
  for (const l of lineas) if (l.estado !== "CANCELLED") porPedido.set(l.amazonOrderId, [...(porPedido.get(l.amazonOrderId) ?? []), l]);
  if (porPedido.size === 0) return;
  const hoy = ventasDeHoy();
  const listings = (ls: Pedido[]) => [...new Set(ls.map(nombreProducto))].map(escapar).join(" + ");
  // Oldest first, so the numbers go up from one message to the next.
  const pedidos = [...porPedido.values()].sort((a, b) => a[0].fecha.getTime() - b[0].fecha.getTime());

  for (const [i, ls] of pedidos.slice(0, MAX_MENSAJES).entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, PAUSA_MS));
    const d = hoy.get(ls[0].amazonOrderId);
    // A late order from a previous day gets its date instead of a number of the day.
    const titulo = d ? `¡Nueva venta! Nº ${d.numero} de hoy` : `¡Nueva venta! (del ${ls[0].fecha.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", timeZone: "Europe/Madrid" })})`;
    const pie = d ? `\nHoy llevas ${uds(d.acumuladas)}` : "";
    await enviarTelegram(`🛒 <b>${titulo}</b>\n${uds(unidadesDe(ls))} · ${listings(ls)} · ${mercado(ls[0])}${pie}`);
  }

  const resto = pedidos.slice(MAX_MENSAJES);
  if (resto.length > 0) {
    await new Promise((r) => setTimeout(r, PAUSA_MS));
    const todas = resto.flat();
    // Units per listing, e.g. "LISTING VIEJO: 3 · LISTING NUEVO: 1".
    const porListing = new Map<string, number>();
    for (const l of todas) porListing.set(nombreProducto(l), (porListing.get(nombreProducto(l)) ?? 0) + l.unidades);
    const detalle = [...porListing].map(([n, u]) => `${escapar(n)}: ${formatNumero(u)}`).join(" · ");
    const total = [...hoy.values()].at(-1)?.acumuladas;
    await enviarTelegram(`🛒 <b>Y ${resto.length} ventas nuevas más</b>\n${uds(unidadesDe(todas))} · ${detalle}${total ? `\nHoy llevas ${uds(total)}` : ""}`);
  }
}
