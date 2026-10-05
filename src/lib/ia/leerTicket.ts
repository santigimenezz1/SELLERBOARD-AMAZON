import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { limpiarEnv } from "@/lib/env";

/*
 * Reads a purchase ticket (photo or PDF) with Claude and returns its details: date, shop, total, VAT and what
 * was bought. The answer comes back as JSON that follows ESQUEMA (structured outputs), so it never needs fixing.
 */

const apiKey = limpiarEnv(process.env.ANTHROPIC_API_KEY);
export const isIAConfigurada = Boolean(apiKey);

export type DatosTicket = {
  /** "YYYY-MM-DD", or null when the ticket shows no readable date. */
  fecha: string | null;
  comercio: string;
  total: number | null;
  /** ISO code: EUR, GBP… */
  moneda: string;
  iva: number | null;
  /** Short summary of what was bought. */
  concepto: string;
};

/** Image types the API reads; anything else (HEIC…) is stored but not read. */
export const TIPOS_LEGIBLES = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"] as const;
type TipoLegible = (typeof TIPOS_LEGIBLES)[number];
export const esLegible = (tipo: string): tipo is TipoLegible => (TIPOS_LEGIBLES as readonly string[]).includes(tipo);

const ESQUEMA = {
  type: "object",
  properties: {
    fecha: { type: ["string", "null"], description: "Fecha de la compra en formato YYYY-MM-DD, o null si no se lee" },
    comercio: { type: "string", description: "Nombre del comercio o empresa que emite el ticket" },
    total: { type: ["number", "null"], description: "Importe total pagado, IVA incluido" },
    moneda: { type: "string", description: "Código ISO de la moneda (EUR, GBP, USD…)" },
    iva: { type: ["number", "null"], description: "Cuota total de IVA del ticket, o null si no aparece" },
    concepto: { type: "string", description: "Resumen breve (máx. 80 caracteres) de lo comprado" },
  },
  required: ["fecha", "comercio", "total", "moneda", "iva", "concepto"],
  additionalProperties: false,
};

const SISTEMA = `Lees tickets y facturas de compra de una empresa española que vende en Amazon y extraes sus datos.
- Las fechas de los tickets españoles van en formato día/mes/año: 03/10/2026 es el 3 de octubre de 2026.
- Si un dato no se ve o no se puede leer con seguridad, devuélvelo como null (o cadena vacía en texto); no lo inventes.
- El total es lo que se pagó al final, con IVA. Si hay varios tipos de IVA, suma las cuotas.
- El concepto va en español, breve: «Material de oficina», «Cajas de cartón y cinta», «Gasolina»…`;

let cliente: Anthropic | null = null;

export async function leerTicket(datos: Buffer, tipo: string): Promise<DatosTicket> {
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY en las variables de entorno para leer los tickets con IA");
  if (!esLegible(tipo)) throw new Error("La IA no puede leer este formato: sube una foto JPG o PNG, o un PDF");
  cliente ??= new Anthropic({ apiKey });

  const data = datos.toString("base64");
  const adjunto: Anthropic.Beta.BetaContentBlockParam =
    tipo === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: tipo, data } };

  const respuesta = await cliente.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
    system: SISTEMA,
    messages: [{ role: "user", content: [adjunto, { type: "text", text: "Extrae los datos de este ticket." }] }],
  });

  if (respuesta.stop_reason === "refusal") throw new Error("La IA no quiso leer este ticket");
  if (respuesta.stop_reason === "max_tokens") throw new Error("La respuesta de la IA quedó cortada");
  const texto = respuesta.content.find((b) => b.type === "text")?.text;
  if (!texto) throw new Error("La IA no devolvió datos");
  const r = JSON.parse(texto) as DatosTicket;

  return {
    fecha: typeof r.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) ? r.fecha : null,
    comercio: (r.comercio ?? "").trim().slice(0, 100),
    total: typeof r.total === "number" && Number.isFinite(r.total) ? Math.round(r.total * 100) / 100 : null,
    moneda: /^[A-Z]{3}$/.test(r.moneda ?? "") ? r.moneda : "EUR",
    iva: typeof r.iva === "number" && Number.isFinite(r.iva) ? Math.round(r.iva * 100) / 100 : null,
    concepto: (r.concepto ?? "").trim().slice(0, 120),
  };
}
