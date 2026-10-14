import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { limpiarEnv } from "@/lib/env";
import type { ResenaCompleta } from "@/lib/datos/h10Tipos";

/*
 * Competitors' reviews translated into Spanish, so the app shows them all in Spanish (the original stays, for «Ver
 * original» and for the AI analyses). Claude Haiku 5.5, the cheap model: translating doesn't need more. Reviews go
 * in batches; each comes back with its language and, unless it was Spanish already, its translation.
 */

const apiKey = limpiarEnv(process.env.ANTHROPIC_API_KEY);
let cliente: Anthropic | null = null;
const conectar = () => {
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY para traducir las reseñas");
  cliente ??= new Anthropic({ apiKey });
  return cliente;
};

const MODELO = "claude-haiku-5-5";
/** Reviews per request, and requests at a time. */
const POR_LOTE = 25;
const A_LA_VEZ = 3;
/** A stored document can't pass 1 MB: translations stop before the reviews (originals + Spanish) get near it. */
const MAX_CARACTERES = 900_000;

// The fields are named «…_es» and the prompt insists: with plainer wording the model sometimes copied the original.
const SISTEMA = `Eres traductor. Recibes reseñas de clientes de Amazon en varios idiomas (italiano, inglés, alemán, francés…) y las traduces AL ESPAÑOL de España.
Para cada reseña devuelve:
- idioma: el idioma ORIGINAL de la reseña (ISO 639-1: es, it, en, de, fr, nl, sv, pl, pt…).
- titulo_es y texto_es: el título y el texto ESCRITOS EN ESPAÑOL. Nunca copies el texto original en otro idioma: tradúcelo completo, fiel y natural, sin resumir ni añadir nada, con el mismo tono, emojis y cifras.
- Si la reseña ya está en español: idioma "es", y titulo_es y texto_es vacíos ("").`;

const ESQUEMA = {
  type: "object",
  properties: {
    resenas: {
      type: "array",
      items: {
        type: "object",
        properties: { n: { type: "integer" }, idioma: { type: "string" }, titulo_es: { type: "string" }, texto_es: { type: "string" } },
        required: ["n", "idioma", "titulo_es", "texto_es"],
        additionalProperties: false,
      },
    },
  },
  required: ["resenas"],
  additionalProperties: false,
};

type Traduccion = { n: number; idioma: string; titulo_es: string; texto_es: string };

async function traducirLote(lote: ResenaCompleta[]): Promise<Traduccion[]> {
  const entrada = lote.map((r, n) => ({ n, titulo: r.titulo, texto: r.texto }));
  // Streaming: a batch of long reviews can take a while to write.
  const r = await conectar()
    .messages.stream({
      model: MODELO,
      max_tokens: 32000,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      system: SISTEMA,
      messages: [{ role: "user", content: JSON.stringify(entrada) }],
    })
    .finalMessage();
  if (r.stop_reason === "refusal") throw new Error("La IA no quiso traducir estas reseñas");
  if (r.stop_reason === "max_tokens") throw new Error("Las reseñas eran demasiado largas para traducirlas de una vez");
  const t = r.content.find((b) => b.type === "text")?.text;
  if (!t) throw new Error("La IA no devolvió la traducción");
  return (JSON.parse(t) as { resenas: Traduccion[] }).resenas;
}

/**
 * The same reviews with their language and Spanish translation. Already translated ones are left as they are; a
 * batch that fails stays untranslated (the app shows the original), so a translation never loses reviews.
 */
export async function traducirResenas(resenas: ResenaCompleta[]): Promise<{ resenas: ResenaCompleta[]; traducidas: number; fallos: number }> {
  const salida = [...resenas];
  let caracteres = resenas.reduce((t, r) => t + r.titulo.length + r.texto.length + (r.tituloEs?.length ?? 0) + (r.textoEs?.length ?? 0), 0);
  const pendientes = salida.map((r, i) => ({ r, i })).filter((x) => !x.r.idioma);
  const lotes: { r: ResenaCompleta; i: number }[][] = [];
  for (let k = 0; k < pendientes.length; k += POR_LOTE) lotes.push(pendientes.slice(k, k + POR_LOTE));
  let traducidas = 0;
  let fallos = 0;
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < lotes.length) {
      const lote = lotes[siguiente++];
      try {
        for (const t of await traducirLote(lote.map((x) => x.r))) {
          const x = lote[t.n];
          if (!x) continue;
          const idioma = t.idioma.trim().toLowerCase().slice(0, 5) || "?";
          const espanol = idioma === "es";
          // Another language returned untranslated (copied as it was, or empty): left pending, never shown as done.
          if (!espanol && (!t.texto_es.trim() || (t.texto_es.trim() === x.r.texto.trim() && x.r.texto.trim().length > 3))) continue;
          if (!espanol && caracteres + t.titulo_es.length + t.texto_es.length > MAX_CARACTERES) continue;
          if (!espanol) caracteres += t.titulo_es.length + t.texto_es.length;
          salida[x.i] = { ...x.r, idioma, ...(!espanol && { tituloEs: t.titulo_es, textoEs: t.texto_es }) };
          if (!espanol) traducidas++;
        }
      } catch (e) {
        console.error("[traducirResenas]", e);
        fallos += lote.length;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, lotes.length) }, trabajador));
  return { resenas: salida, traducidas, fallos };
}
