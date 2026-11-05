import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { limpiarEnv } from "@/lib/env";
import { estudioParaAgente } from "@/lib/datos/estudiosH10";
import { nombrePais } from "@/lib/datos/h10Analisis";
import type { CodigoPais, DestinoPalabra, ListingPropio } from "@/lib/datos/h10Tipos";

/*
 * «Proponer con IA» in «Lanzamiento»: a first draft of your listing for one country (title and 5 bullets), written in
 * that country's language from the keywords you chose and where each one goes, your own improvements and the
 * market's failings you noted. Claude Opus: writing that sells and fits the limits needs the best model; one call,
 * a few cents. The owner edits it afterwards.
 */

const MODELO = "claude-opus-5-5";
const IDIOMA: Record<CodigoPais, string> = { ES: "español de España", DE: "alemán", FR: "francés", IT: "italiano", GB: "inglés británico" };
const DESTINO: Record<DestinoPalabra, string> = {
  principal: "PRINCIPAL (abre el título, tal cual)",
  titulo: "TÍTULO (debe ir en el título)",
  bullets: "BULLETS (repartida en las viñetas)",
  backend: "BACKEND (va oculta en los términos de búsqueda: no hace falta en el texto)",
  ppc: "SOLO PPC (no la pongas en el texto)",
};

const ESQUEMA = {
  type: "object",
  properties: {
    titulo: { type: "string", description: "El título, como máximo 200 caracteres" },
    bullets: { type: "array", items: { type: "string" }, description: "Exactamente 5 viñetas" },
  },
  required: ["titulo", "bullets"],
  additionalProperties: false,
};

let cliente: Anthropic | null = null;
const conectar = () => {
  const apiKey = limpiarEnv(process.env.ANTHROPIC_API_KEY);
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY para proponer el listing con IA");
  cliente ??= new Anthropic({ apiKey });
  return cliente;
};

/** What the tab has on screen, sent with the request (it may not be saved yet). */
export type EnPantalla = { palabras?: { texto: string; destino?: DestinoPalabra; busquedas: number }[]; actual?: ListingPropio };

/** A draft title and 5 bullets for the study's listing in one country. */
export async function proponerListing(id: string, pais: CodigoPais, enPantalla: EnPantalla = {}): Promise<ListingPropio> {
  const { estudio } = await estudioParaAgente(id);
  const palabras = enPantalla.palabras ?? (estudio.palabrasLanzamiento ?? []).filter((p) => p.pais === pais);
  if (!palabras.length) throw new Error(`Elige antes algunas palabras de ${nombrePais(pais)} en «Palabras clave»`);
  const mejoras = (estudio.mejoras ?? []).filter((m) => m.texto.trim());
  const propias = mejoras.filter((m) => m.tipo === "propia").map((m) => `- ${m.texto.trim()}`);
  const fallas = mejoras.filter((m) => (m.tipo ?? "mercado") === "mercado").map((m) => `- ${m.texto.trim()}`);
  const actual = enPantalla.actual ?? estudio.listingPropio?.[pais];
  const hayActual = !!actual && (actual.titulo.trim() || actual.bullets.some((b) => b.trim()));

  const contenido = [
    `Producto: ${estudio.nombre}${estudio.descripcion ? ` — ${estudio.descripcion}` : ""}`,
    `Mercado: Amazon ${nombrePais(pais)}. Escribe en ${IDIOMA[pais]}.`,
    "",
    "Palabras clave elegidas, en orden de prioridad, con su destino y sus búsquedas al mes:",
    ...palabras.map(
      (p, i) => `${i + 1}. «${p.texto}» · ${p.destino ? DESTINO[p.destino] : "sin destino (úsala donde encaje mejor)"} · ${p.busquedas} búsquedas`,
    ),
    "",
    propias.length
      ? `Mejoras propias del producto (sus puntos fuertes, úsalos para vender):\n${propias.join("\n")}`
      : "Mejoras propias del producto: no hay apuntadas.",
    fallas.length ? `Fallos de la competencia que este producto evita (di que tu producto no los tiene, sin nombrar marcas):\n${fallas.join("\n")}` : "",
    hayActual
      ? `\nBorrador actual del dueño (mejóralo, conservando lo que esté bien):\nTítulo: ${actual!.titulo}\n${actual!.bullets.map((b, i) => `Bullet ${i + 1}: ${b}`).join("\n")}`
      : "",
  ]
    .filter((x) => x !== "")
    .join("\n");

  const r = await conectar()
    .beta.messages.stream({
      model: MODELO,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
      system: `Eres un experto en listings de Amazon que convierten, nativo del idioma del mercado. Escribe el título y las 5 viñetas (bullets) de un producto de marca propia.
Reglas:
- Título: como máximo 200 caracteres. Empieza por la palabra PRINCIPAL tal cual (o casi), y lo más importante en los primeros 80 caracteres (es lo que se ve en el móvil). Incluye las palabras de TÍTULO de forma natural, sin repetir palabras ni amontonarlas. Sin mayúsculas en todo el título, sin símbolos raros, sin precios, ofertas ni frases como «el mejor» o «nº 1».
- Bullets: exactamente 5, de unos 150 a 250 caracteres cada uno. Cada uno empieza con un BENEFICIO EN MAYÚSCULAS (2 a 5 palabras) seguido de dos puntos y una explicación concreta. Reparte las palabras de BULLETS de forma natural. El orden: lo que más le importa al comprador primero.
- Usa las mejoras propias como argumentos de venta y responde a los fallos de la competencia.
- No inventes datos que no se te dan (medidas, materiales, cantidades, certificados, garantías): si hace falta uno, deja un hueco así: [completar: medida exacta].
- Nada de afirmaciones médicas, de seguridad no demostrada ni comparaciones con marcas.
- Las palabras de SOLO PPC no van en el texto; las de BACKEND no hace falta ponerlas.`,
      messages: [{ role: "user", content: contenido }],
    })
    .finalMessage();
  if (r.stop_reason === "refusal") throw new Error("La IA no quiso escribir este listing");
  if (r.stop_reason === "max_tokens") throw new Error("La respuesta de la IA salió demasiado larga: prueba otra vez");
  const t = r.content.find((b) => b.type === "text")?.text;
  if (!t) throw new Error("La IA no devolvió el listing");
  const j = JSON.parse(t) as { titulo?: unknown; bullets?: unknown };
  const bullets = Array.isArray(j.bullets) ? j.bullets.map((b) => (typeof b === "string" ? b.trim() : "")) : [];
  return {
    titulo: typeof j.titulo === "string" ? j.titulo.trim().slice(0, 500) : "",
    bullets: Array.from({ length: 5 }, (_, i) => (bullets[i] ?? "").slice(0, 1000)),
  };
}
