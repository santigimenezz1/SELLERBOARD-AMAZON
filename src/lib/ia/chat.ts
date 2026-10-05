import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { limpiarEnv } from "@/lib/env";
import { diaMadrid } from "@/lib/datos/fechas";
import { contextoChat, definicionesHerramientas, ejecutarHerramienta, etiquetaHerramienta } from "./herramientasChat";

/*
 * «Pregunta a tu app»: Claude answers questions about the shop, calling the read-only tools in
 * herramientasChat.ts to fetch the figures. The conversation lives in the browser, which sends it back on every
 * question unchanged (Claude's thinking blocks must come back exactly as they were returned).
 */

const apiKey = limpiarEnv(process.env.ANTHROPIC_API_KEY);
export const isChatConfigurado = Boolean(apiKey);

/** Rounds of tool calls per question, so a confused run can't loop forever. */
const MAX_VUELTAS = 8;
/** Messages a conversation can hold before it has to start over (each tool round adds two). */
export const MAX_MENSAJES = 80;

export type EventoChat =
  | { tipo: "texto"; texto: string }
  | { tipo: "consulta"; etiqueta: string; detalle: string }
  | { tipo: "fin"; historial: Anthropic.Beta.BetaMessageParam[] }
  | { tipo: "error"; mensaje: string };

const INSTRUCCIONES = `Eres el asistente de datos de Electronic VLC, una tienda que vende en Amazon en varios países de Europa. Respondes en español las preguntas del dueño sobre sus ventas, productos, stock, gastos de Amazon, Vine, devoluciones, estado de la cuenta y tickets de compra.

Cómo trabajar:
- Usa siempre las herramientas para obtener las cifras: no inventes ni supongas datos. Si una herramienta no tiene lo que te piden, dilo claramente.
- Interpreta los periodos con la fecha de hoy que se te da: «el mes pasado» es el mes natural anterior completo, «este mes» va del día 1 a hoy, «esta semana» empieza el lunes.
- Para comparar periodos, consulta cada uno por separado.
- Las ventas son lo que pagó el cliente, IVA incluido, en euros (los pedidos en libras u otras monedas se convierten al cambio del día del pedido). Los pedidos cancelados no cuentan. Los reembolsos se cuentan en la fecha en que se devolvió el dinero.
- Reino Unido es el código GB.

Cómo responder:
- Ve al grano: empieza por la respuesta y luego los detalles que aporten.
- Usa el formato español para los números: 1.234,56 €.
- Para listas de varios productos o países usa una tabla en Markdown; para el resto, frases cortas o viñetas. Puedes usar **negrita**.
- Nombra los productos por su título corto (no solo el SKU).
- Si algo de los datos es llamativo (un país que cae, un producto sin stock), menciónalo en una línea al final.`;

let cliente: Anthropic | null = null;

function fechaDeHoy(): string {
  const hoy = diaMadrid(new Date());
  const [y, m, d] = hoy.split("-").map(Number);
  const nombre = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return `Hoy es ${nombre} (${hoy}), hora de Madrid.`;
}

/** Short description of a tool call for the user: «01/09/2026 – 30/09/2026 · GB». */
function detalleConsulta(entrada: unknown): string {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const fecha = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : typeof v === "string" ? v : "");
  const partes = [
    e.desde && e.hasta ? `${fecha(e.desde)} – ${fecha(e.hasta)}` : "",
    e.desde_mes && e.hasta_mes ? `${e.desde_mes} – ${e.hasta_mes}` : "",
    typeof e.pais === "string" && e.pais ? e.pais.toUpperCase() : "",
    typeof e.sku === "string" && e.sku ? `SKU ${e.sku}` : "",
  ];
  return partes.filter(Boolean).join(" · ");
}

/** Answers `pregunta` within the conversation `historial`, sending text and progress to `emitir` as it goes. */
export async function responder(historial: Anthropic.Beta.BetaMessageParam[], pregunta: string, emitir: (e: EventoChat) => void): Promise<void> {
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY en las variables de entorno");
  cliente ??= new Anthropic({ apiKey });
  const ctx = await contextoChat();
  const herramientas = definicionesHerramientas();
  const mercados = ctx.marketplaces.map((m) => `${m.pais} (${m.codigoPais}, ${m.moneda})`).join(", ");
  const mensajes: Anthropic.Beta.BetaMessageParam[] = [...historial, { role: "user", content: pregunta }];

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const stream = cliente.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      // Instructions first and cached; today's date and the markets after the cache point.
      system: [
        { type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } },
        { type: "text", text: `${fechaDeHoy()}\nMarketplaces de la cuenta: ${mercados}.` },
      ],
      tools: herramientas,
      messages: mensajes,
    });
    stream.on("text", (texto) => emitir({ tipo: "texto", texto }));

    let respuesta: Anthropic.Beta.BetaMessage;
    try {
      respuesta = await stream.finalMessage();
    } catch (e) {
      // A tool input that couldn't be parsed at all: ask again; API errors go up.
      if (e instanceof Anthropic.APIError || vuelta === MAX_VUELTAS - 1) throw e;
      continue;
    }
    mensajes.push({ role: "assistant", content: respuesta.content });

    if (respuesta.stop_reason === "refusal") {
      emitir({ tipo: "texto", texto: "\n\nNo puedo responder a esa pregunta." });
      break;
    }
    if (respuesta.stop_reason === "max_tokens") {
      emitir({ tipo: "texto", texto: "\n\n(La respuesta se cortó por larga: pregunta algo más concreto.)" });
      break;
    }
    const usos = respuesta.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (respuesta.stop_reason !== "tool_use" || usos.length === 0) break;

    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const uso of usos) {
      emitir({ tipo: "consulta", etiqueta: etiquetaHerramienta(uso.name), detalle: detalleConsulta(uso.input) });
      const r = await ejecutarHerramienta(uso.name, uso.input, ctx);
      resultados.push({ type: "tool_result", tool_use_id: uso.id, content: r.contenido, ...(r.error && { is_error: true }) });
    }
    // All the results of one turn go back in a single message.
    mensajes.push({ role: "user", content: resultados });
    if (vuelta === MAX_VUELTAS - 1) emitir({ tipo: "texto", texto: "\n\n(He hecho demasiadas consultas para esta pregunta: prueba a dividirla.)" });
  }

  emitir({ tipo: "fin", historial: mensajes });
}

/** A readable message for an API error. */
export function mensajeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "La clave de la IA no es válida: revisa ANTHROPIC_API_KEY";
  if (e instanceof Anthropic.RateLimitError) return "Demasiadas preguntas seguidas: espera unos segundos y vuelve a probar";
  if (e instanceof Anthropic.BadRequestError && /credit|balance/i.test(e.message)) return "No queda saldo en la cuenta de Anthropic: recarga créditos en console.anthropic.com";
  if (e instanceof Anthropic.APIError) return `La IA no respondió (error ${e.status ?? "de conexión"}). Prueba otra vez.`;
  return e instanceof Error ? e.message : "No se pudo responder";
}
