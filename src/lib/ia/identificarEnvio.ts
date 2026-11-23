import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { limpiarEnv } from "@/lib/env";

/*
 * Which carrier a shipping label belongs to (Vinted Go, Correos, InPost or SEUR), and the product if it shows.
 *
 * 1. Free: the file name and the PDF's text (extracted in the browser) are checked against what each label says.
 * 2. Only if that isn't enough, Claude Haiku looks at the image or PDF (well under a cent per label).
 */

export type EmpresaEnvio = "vinted" | "correos" | "inpost" | "seur";
export type Identificacion = { tipo: EmpresaEnvio | null; producto: string; por: "texto" | "ia" | null };

const apiKey = limpiarEnv(process.env.ANTHROPIC_API_KEY);
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * A Correos tracking code: 23 characters, starting with "P" and ending in a letter (PL8MRM9818582580126005L).
 * Correos «Paq» labels sent as a screenshot show only this barcode.
 */
const CODIGO_CORREOS = /\bP[A-Z0-9]{21}[A-Z]\b/;

/** By the words on the label (PDF text) or in the file name. The parcel company goes before «Vinted» (Vinted ships through them too). */
export function identificarPorTexto(texto: string, nombreArchivo: string): EmpresaEnvio | null {
  for (const fuente of [texto, nombreArchivo]) {
    // "alfombra_correos_.png": underscores, dashes and dots split words too.
    const t = sinAcentos(fuente).replace(/[_\-.]+/g, " ");
    if (!t.trim()) continue;
    if (/\binpost\b/.test(t)) return "inpost";
    if (/\bseur\b/.test(t)) return "seur";
    if (/\bcorreos?\b/.test(t)) return "correos";
    if (/\bvinted\b/.test(t)) return "vinted";
    if (CODIGO_CORREOS.test(fuente.toUpperCase())) return "correos";
  }
  return null;
}

const ESQUEMA = {
  type: "object",
  properties: {
    empresa: { type: "string", enum: ["vinted", "correos", "inpost", "seur", "desconocida"], description: "Empresa donde se entrega el paquete" },
    producto: { type: "string", description: "Nombre del producto si aparece escrito en la imagen (máx. 80 caracteres); cadena vacía si no aparece" },
  },
  required: ["empresa", "producto"],
  additionalProperties: false,
};

const SISTEMA = `Clasificas etiquetas de envío de paquetes de segunda mano (Vinted, Wallapop) según la empresa donde se entregan.
Cómo es cada una:
- vinted: etiqueta «Vinted Go» (puntos y lockers de Vinted): cabecera negra con el logo de Vinted, «Escanea este código para enviar el paquete», un QR y un número de 16 dígitos.
- inpost: menciona InPost (logo amarillo, «InPost Punto Pack», «Locker»). A menudo es una captura de la app de Vinted o Wallapop con «Empresa de paquetería: InPost»: entonces es inpost, no vinted.
- correos: logo amarillo de Correos, o solo un código de barras con un código de 23 caracteres que empieza por «P» y termina en letra (p. ej. PL8MRM9818582580126005L).
- seur: menciona SEUR o lleva su logo.
Si la imagen dice expresamente la empresa de paquetería, manda eso. Si no se puede saber con seguridad, responde «desconocida»; no adivines.
El producto solo si está escrito (por ejemplo «Pedido: Kit completo alfombra entrenamiento futbol con App»); si no, cadena vacía.`;

let cliente: Anthropic | null = null;
const LEGIBLES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

/** Claude Haiku looks at the label. Null type when it can't tell (or the AI isn't configured). */
export async function identificarConIA(datos: Buffer, contentType: string): Promise<{ tipo: EmpresaEnvio | null; producto: string }> {
  if (!apiKey) return { tipo: null, producto: "" };
  const esImagen = (LEGIBLES as readonly string[]).includes(contentType);
  if (!esImagen && contentType !== "application/pdf") return { tipo: null, producto: "" };
  cliente ??= new Anthropic({ apiKey });
  const data = datos.toString("base64");
  const adjunto: Anthropic.ContentBlockParam = esImagen
    ? { type: "image", source: { type: "base64", media_type: contentType as (typeof LEGIBLES)[number], data } }
    : { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  const r = await cliente.messages.create({
    model: "claude-haiku-5-5",
    max_tokens: 4000,
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
    system: SISTEMA,
    messages: [{ role: "user", content: [adjunto, { type: "text", text: "¿De qué empresa es esta etiqueta y qué producto es?" }] }],
  });
  if (r.stop_reason !== "end_turn") return { tipo: null, producto: "" };
  const texto = r.content.find((b) => b.type === "text")?.text;
  if (!texto) return { tipo: null, producto: "" };
  const j = JSON.parse(texto) as { empresa?: string; producto?: string };
  const tipo = (["vinted", "correos", "inpost", "seur"] as const).find((t) => t === j.empresa) ?? null;
  return { tipo, producto: typeof j.producto === "string" ? j.producto.trim().slice(0, 120) : "" };
}

/** Free rules first; the AI only when they don't settle it. Never throws: an unknown label just stays unidentified. */
export async function identificarEnvio(datos: Buffer, contentType: string, nombreArchivo: string, textoPdf: string): Promise<Identificacion> {
  const porTexto = identificarPorTexto(textoPdf, nombreArchivo);
  if (porTexto) return { tipo: porTexto, producto: "", por: "texto" };
  try {
    const ia = await identificarConIA(datos, contentType);
    return { ...ia, por: ia.tipo ? "ia" : null };
  } catch (e) {
    console.error("[wallapop] identificar con IA", e);
    return { tipo: null, producto: "", por: null };
  }
}
