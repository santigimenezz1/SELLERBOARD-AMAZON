import { NextResponse, type NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { MAX_MENSAJES, mensajeError, responder, type EventoChat } from "@/lib/ia/chat";
import { volcarConsumo } from "@/lib/datos/consumo";

/**
 * Asks the chat a question. Body: { pregunta, historial } (historial: the conversation so far, exactly as the
 * last answer's «fin» event returned it). Answers with one JSON event per line (EventoChat), as it's written.
 */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const cuerpo = (await req.json().catch(() => null)) as { pregunta?: unknown; historial?: unknown } | null;
  const pregunta = typeof cuerpo?.pregunta === "string" ? cuerpo.pregunta.trim().slice(0, 2000) : "";
  if (!pregunta) return NextResponse.json({ error: "Escribe una pregunta" }, { status: 400 });
  const historial = cuerpo?.historial ?? [];
  if (!Array.isArray(historial) || historial.some((m) => !m || typeof m !== "object" || !["user", "assistant"].includes((m as { role?: unknown }).role as string)))
    return NextResponse.json({ error: "Conversación no válida: empieza una nueva" }, { status: 400 });
  if (historial.length > MAX_MENSAJES) return NextResponse.json({ error: "La conversación es muy larga: empieza una nueva" }, { status: 400 });

  const codificador = new TextEncoder();
  const cuerpoRespuesta = new ReadableStream<Uint8Array>({
    async start(controlador) {
      const emitir = (e: EventoChat) => controlador.enqueue(codificador.encode(`${JSON.stringify(e)}\n`));
      try {
        await responder(historial as Anthropic.Beta.BetaMessageParam[], pregunta, emitir);
      } catch (e) {
        console.error("[api/chat]", e);
        emitir({ tipo: "error", mensaje: mensajeError(e) });
      } finally {
        await volcarConsumo().catch(() => {});
        controlador.close();
      }
    },
  });
  return new Response(cuerpoRespuesta, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
