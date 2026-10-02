import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import type { Pedido } from "@/lib/datos/tipos";
import type { CorreoCliente } from "@/lib/gmail";
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

const g = globalThis as unknown as { __telegramChat?: string | null; __telegramGrupos?: Partial<Record<Grupo, string>> };

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
 * Groups with their own kind of notice (their own chat, so the phone can give each its own sound). Each is
 * found by env, then Firestore (`config/telegram.<campo>`), then the latest group the bot was added to or
 * written in whose title matches. A missing group sends to the sales chat instead.
 */
const GRUPOS = {
  /** Account alerts: any group not claimed by the title of another kind. */
  alertas: { env: "TELEGRAM_CHAT_ALERTAS", campo: "chatAlertas", titulo: (t: string) => !/mensaje|listing|infracci|vine/i.test(t) },
  /** Buyer messages: the group named «Mensaje comprador Amazon» (any title with «mensaje»). */
  mensajes: { env: "TELEGRAM_CHAT_MENSAJES", campo: "chatMensajes", titulo: (t: string) => /mensaje/i.test(t) },
  /** Watched listings going inactive / active again: the group «Listing inactivo» (any title with «listing»). */
  listings: { env: "TELEGRAM_CHAT_LISTINGS", campo: "chatListings", titulo: (t: string) => /listing/i.test(t) },
  /** New policy infractions while the account stays at 200+ points: «Estado cuenta infraccion +200 pt». */
  infracciones: { env: "TELEGRAM_CHAT_INFRACCIONES", campo: "chatInfracciones", titulo: (t: string) => /infracci/i.test(t) },
  /** Vine units claimed by reviewers: the group «Vine». */
  vine: { env: "TELEGRAM_CHAT_VINE", campo: "chatVine", titulo: (t: string) => /vine/i.test(t) },
} as const;
type Grupo = keyof typeof GRUPOS;

async function chatGrupo(grupo: Grupo): Promise<string | null> {
  const { env, campo, titulo } = GRUPOS[grupo];
  if (process.env[env]) return process.env[env];
  const cache = (g.__telegramGrupos ??= {});
  if (cache[grupo]) return cache[grupo];
  const ref = adminDb().collection("config").doc("telegram");
  const guardado = (await ref.get()).get(campo) as string | undefined;
  contarLecturas(1);
  if (guardado) return (cache[grupo] = guardado);
  const updates = await api<Actualizacion[]>("getUpdates");
  const encontrado = updates
    .flatMap((u) => [
      u.message?.migrate_to_chat_id ? { id: u.message.migrate_to_chat_id, type: "supergroup", title: u.message.chat?.title } : null,
      u.message?.chat,
      u.my_chat_member?.chat,
    ])
    .filter((c): c is Chat => !!c && (c.type === "group" || c.type === "supergroup") && titulo(c.title ?? ""))
    .at(-1);
  if (!encontrado) return null;
  cache[grupo] = String(encontrado.id);
  await ref.set({ [campo]: cache[grupo], [`${campo}ConectadoEn`]: new Date().toISOString() }, { merge: true });
  contarEscrituras(1);
  return cache[grupo];
}

/** `destino` other than "ventas": that group when there is one, otherwise the sales chat. */
export async function enviarTelegram(texto: string, destino: "ventas" | Grupo = "ventas"): Promise<boolean> {
  if (!telegramConfigurado()) return false;
  const chat = (destino !== "ventas" ? await chatGrupo(destino) : null) ?? (await chatId());
  if (!chat) throw new Error("el bot aún no tiene tu chat: escríbele «hola» en Telegram");
  try {
    await api("sendMessage", { chat_id: chat, text: texto, parse_mode: "HTML", disable_web_page_preview: true });
  } catch (e) {
    // A group that became a supergroup gets a new id: Telegram says which one; keep it and retry.
    const nuevo = e instanceof Error ? e.message.match(/migrated to a supergroup with id (-?\d+)/i)?.[1] : null;
    if (!nuevo || destino === "ventas") throw e;
    (g.__telegramGrupos ??= {})[destino] = nuevo;
    await adminDb().collection("config").doc("telegram").set({ [GRUPOS[destino].campo]: nuevo }, { merge: true });
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

/** Longest piece of the buyer's text shown in the notice (the full message is in «Mensajes» in the app). */
const MAX_TEXTO = 350;

/**
 * Notice of each new buyer message, to the «Mensaje comprador Amazon» group: marketplace, buyer, order,
 * product and the start of the text. Oldest first, a moment apart so each rings; beyond MAX_MENSAJES at once
 * the rest come in one last message.
 */
export async function avisarMensajesClientes(mensajes: CorreoCliente[]): Promise<void> {
  if (!telegramConfigurado() || mensajes.length === 0) return;
  const orden = [...mensajes].sort((a, b) => a.fecha.localeCompare(b.fecha));

  for (const [i, m] of orden.slice(0, MAX_MENSAJES).entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, PAUSA_MS));
    const mk = m.marketplaceId ? marketplaceConocido(m.marketplaceId) : null;
    const pais = mk ? `${bandera(mk.codigoPais)} ${escapar(mk.pais)}` : escapar(m.dominio || "Amazon");
    const producto = m.asin && ETIQUETAS_POR_ASIN[m.asin] ? ETIQUETAS_POR_ASIN[m.asin] : m.producto?.slice(0, 50);
    const texto = m.texto.length > MAX_TEXTO ? `${m.texto.slice(0, MAX_TEXTO).trimEnd()}…` : m.texto;
    const lineas = [
      `💬 <b>Nuevo mensaje de cliente</b>`,
      `${pais}${m.cliente ? ` · ${escapar(m.cliente)}` : ""}`,
      m.pedido ? `Pedido ${escapar(m.pedido)}` : null,
      producto ? `📦 ${escapar(producto)}` : null,
      texto ? `\n«${escapar(texto)}»` : null,
    ];
    await enviarTelegram(lineas.filter((l) => l !== null).join("\n"), "mensajes");
  }

  const resto = orden.length - MAX_MENSAJES;
  if (resto > 0) {
    await new Promise((r) => setTimeout(r, PAUSA_MS));
    await enviarTelegram(`💬 <b>Y ${resto} mensajes de clientes más</b>\nLos tienes en «Mensajes» en la app.`, "mensajes");
  }
}

export type CambioListing = { nombre: string; sku: string; marketplaceId: string; activo: boolean; motivo: string | null };

/**
 * A watched listing that stopped being buyable in a marketplace (red, with Amazon's reason when it gives one)
 * or is buyable again (green). One message per change, to the «Listing inactivo» group.
 */
export async function avisarListings(cambios: CambioListing[]): Promise<void> {
  if (!telegramConfigurado()) return;
  for (const [i, c] of cambios.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, PAUSA_MS));
    const mk = marketplaceConocido(c.marketplaceId);
    const pais = mk ? `${bandera(mk.codigoPais)} ${escapar(mk.pais)}` : escapar(c.marketplaceId);
    const listing = c.nombre === c.sku ? `<b>${escapar(c.sku)}</b>` : `<b>${escapar(c.nombre)}</b> (${escapar(c.sku)})`;
    await enviarTelegram(
      c.activo
        ? `🟢 <b>Listing activo de nuevo</b>\n${listing}\n${pais}`
        : `🔴 <b>¡Listing inactivo!</b>\n${listing}\n${pais}${c.motivo ? `\nMotivo: ${escapar(c.motivo.slice(0, 300))}` : ""}\nRevísalo en Seller Central.`,
      "listings",
    );
  }
}

export type NuevaInfraccion = {
  marketplaceId: string;
  /** null when the account health report has no score for that marketplace yet. */
  puntuacion: number | null;
  puntuacionAntes: number | null;
  /** Each category that went up, e.g. { texto: "Incumplimiento de la política de publicación", antes: 0, ahora: 1 }. */
  subidas: { texto: string; antes: number; ahora: number }[];
  /** What each new issue is about, when known (compliance issues: "SKU: Amazon's message"). */
  detalles?: string[];
};

/**
 * New policy infractions in a marketplace whose Account Health Rating is still at 200+ points (below that the
 * «estado en riesgo» notice already goes to the alerts group). One message per marketplace.
 */
export async function avisarInfracciones(nuevas: NuevaInfraccion[]): Promise<void> {
  if (!telegramConfigurado()) return;
  for (const [i, n] of nuevas.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, PAUSA_MS));
    const mk = marketplaceConocido(n.marketplaceId);
    const pais = mk ? `${bandera(mk.codigoPais)} ${escapar(mk.pais)}` : escapar(n.marketplaceId);
    const antes = n.puntuacionAntes !== null && n.puntuacionAntes !== n.puntuacion ? ` (antes ${formatNumero(n.puntuacionAntes)})` : "";
    const puntos = n.puntuacion !== null ? ` · <b>${formatNumero(n.puntuacion)} puntos</b>${antes}` : "";
    const lineas = n.subidas.map((s) => `• ${escapar(s.texto)}: ${formatNumero(s.antes)} → <b>${formatNumero(s.ahora)}</b>`);
    const detalles = (n.detalles ?? []).map((d) => `📦 ${escapar(d.length > 250 ? `${d.slice(0, 250).trimEnd()}…` : d)}`);
    await enviarTelegram(
      `⚠️ <b>Nueva infracción en la salud de la cuenta</b>\n${pais}${puntos}\n${[...lineas, ...detalles].join("\n")}\nRevisa «Estado de la cuenta» en la app o en Seller Central.`,
      "infracciones",
    );
  }
}

export type ReclamoVine = {
  marketplaceId: string;
  /** Listing name (label) of the claimed units. */
  producto: string;
  /** Units claimed in this notice. */
  unidades: number;
  /** Units claimed in that marketplace before / now (all Vine orders the app knows). */
  antes: number;
  ahora: number;
  /** Units registered in that marketplace's Vine enrollment, when it is in the Vine table. */
  registradas: number | null;
};

/** A Vine reviewer claimed units (a 100 %-discount order): one message per marketplace, to the «Vine» group. */
export async function avisarVine(reclamos: ReclamoVine[]): Promise<void> {
  if (!telegramConfigurado()) return;
  for (const [i, r] of reclamos.entries()) {
    if (i > 0) await new Promise((res) => setTimeout(res, PAUSA_MS));
    const mk = marketplaceConocido(r.marketplaceId);
    const pais = mk ? `${bandera(mk.codigoPais)} ${escapar(mk.pais)}` : escapar(r.marketplaceId);
    const de = r.registradas ? ` de ${formatNumero(r.registradas)}` : "";
    await enviarTelegram(
      `🎁 <b>${r.unidades === 1 ? "Nueva unidad de Vine reclamada" : `${formatNumero(r.unidades)} unidades de Vine reclamadas`}</b>\n${pais} · ${escapar(r.producto)}\nReclamado: ${formatNumero(r.antes)} → <b>${formatNumero(r.ahora)}</b>${de}`,
      "vine",
    );
  }
}
