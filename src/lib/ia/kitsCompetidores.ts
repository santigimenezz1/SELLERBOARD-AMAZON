import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { limpiarEnv } from "@/lib/env";
import { estudioParaAgente, guardarKitsCompetidores } from "@/lib/datos/estudiosH10";
import { fichasCatalogo, preciosCompetidores, type ItemCatalogoCompleto } from "@/lib/amazon/apis";
import { nombrePais } from "@/lib/datos/h10Analisis";
import type { CodigoPais, ElementoKit, KitCompetidor, KitsCompetidores } from "@/lib/datos/h10Tipos";

/*
 * «Kits competidores»: the 20 best sellers of each country of a study (by the Xray's monthly sales), with their
 * listing read from Amazon's catalog (title, bullets, main photo) and today's price, and what each kit includes,
 * read by Claude Sonnet from what the seller states (nothing guessed). One call per country; kept with the study.
 */

const MODELO = "claude-sonnet-5-5";
const POR_PAIS = 20;
const MARKETPLACE: Record<CodigoPais, string> = { ES: "A1RKKUPIHCS9HS", DE: "A1PA6795UKMFR9", FR: "A13V1IB3VIYZZH", IT: "APJ6JRA9NG5V4", GB: "A1F83G8C2ARO7P" };
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ESQUEMA = {
  type: "object",
  properties: {
    productos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          asin: { type: "string" },
          elementos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                cantidad: { type: ["integer", "null"], description: "Cuántas unidades; null si el vendedor no lo dice" },
                nombre: { type: "string", description: "En español, corto: «Portería», «Balón», «Bomba de aire», «Conos», «Escalera de agilidad», «Diana / panel de tiro», «Bolsa de transporte», «Estacas»…" },
                detalle: { type: ["string", "null"], description: "Medida, talla o material si lo da (p. ej. «120×90×90 cm», «talla 3», «acero»); null si no" },
              },
              required: ["cantidad", "nombre", "detalle"],
              additionalProperties: false,
            },
          },
          otroProducto: { type: ["string", "null"], description: "Si NO es el mismo tipo de producto que el estudio, qué es en 2–4 palabras; si lo es, null" },
        },
        required: ["asin", "elementos", "otroProducto"],
        additionalProperties: false,
      },
    },
  },
  required: ["productos"],
  additionalProperties: false,
};

let cliente: Anthropic | null = null;
const conectar = () => {
  const apiKey = limpiarEnv(process.env.ANTHROPIC_API_KEY);
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY para analizar los kits");
  cliente ??= new Anthropic({ apiKey });
  return cliente;
};

/** The listing's main photo, the biggest one Amazon gives. */
const fotoPrincipal = (f: ItemCatalogoCompleto | undefined) =>
  f?.images?.[0]?.images.filter((i) => i.variant === "MAIN").sort((a, b) => b.width - a.width)[0]?.link ?? null;
const bulletsDe = (f: ItemCatalogoCompleto | undefined) => (f?.attributes?.bullet_point ?? []).map((b) => String(b.value ?? "")).filter(Boolean);

/** What each product's kit includes, from its title and bullets (one call for a country's products). */
async function leerKits(producto: string, items: { asin: string; titulo: string; bullets: string[] }[]) {
  const r = await conectar()
    .beta.messages.stream({
      model: MODELO,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
      system: `Lees fichas de Amazon de productos de la competencia y dices qué contiene exactamente cada kit. El producto que se estudia es: «${producto}».
Reglas:
- Lista SOLO lo que el vendedor dice expresamente que incluye (en el título o en los bullets). No supongas nada: si no lo menciona, no lo pongas.
- Con su cantidad (si dice «2 porterías», cantidad 2; «conos» sin número, cantidad null) y su medida o talla si la da.
- Lo que la ficha dice que solo traen «algunas opciones» o variantes, no lo pongas.
- Las piezas del propio producto (varillas, conectores, red ya montada) no cuentan como elementos aparte, salvo redes o dianas extra intercambiables.
- Nombres en español, cortos y siempre iguales para lo mismo, para poder comparar kits.
- otroProducto: si el artículo no es del mismo tipo que el producto del estudio (p. ej. un rebounder o dianas de pared en un estudio de porterías), di qué es; si es del mismo tipo, null.`,
      messages: [
        {
          role: "user",
          content: items.map((p) => `ASIN ${p.asin}\nTítulo: ${p.titulo}\nBullets:\n${p.bullets.map((b) => `- ${b}`).join("\n") || "(sin bullets)"}`).join("\n\n---\n\n"),
        },
      ],
    })
    .finalMessage();
  if (r.stop_reason === "refusal") throw new Error("La IA no quiso leer estas fichas");
  if (r.stop_reason === "max_tokens") throw new Error("La respuesta de la IA salió demasiado larga");
  const t = r.content.find((b) => b.type === "text")?.text;
  if (!t) throw new Error("La IA no devolvió los kits");
  const j = JSON.parse(t) as { productos: { asin: string; elementos: ElementoKit[]; otroProducto: string | null }[] };
  return new Map(j.productos.map((p) => [p.asin, p]));
}

/** Reads the best sellers of every country of the study and saves their kits. */
export async function analizarKitsCompetidores(id: string): Promise<KitsCompetidores> {
  const { estudio } = await estudioParaAgente(id);
  if (!estudio.mercados.length) throw new Error("El estudio no tiene ningún Xray");
  const porPais: KitsCompetidores["porPais"] = {};
  for (const m of estudio.mercados) {
    const top = m.competidores
      .filter((c) => c.asin)
      .sort((a, b) => (b.ventas ?? -1) - (a.ventas ?? -1))
      .slice(0, POR_PAIS);
    if (!top.length) continue;
    const asins = top.map((c) => c.asin!);
    const fichas = new Map((await fichasCatalogo(asins, MARKETPLACE[m.codigoPais])).map((f) => [f.asin, f]));
    await pausa(1200);
    const precios = await preciosCompetidores(asins, MARKETPLACE[m.codigoPais]).catch(() => new Map<string, { precio: number | null }>());
    await pausa(1200);
    const kits = await leerKits(
      `${estudio.nombre} (${nombrePais(m.codigoPais)})`,
      top.map((c) => ({ asin: c.asin!, titulo: fichas.get(c.asin!)?.summaries?.[0]?.itemName ?? c.titulo, bullets: bulletsDe(fichas.get(c.asin!)) })),
    );
    porPais[m.codigoPais] = top.map((c): KitCompetidor => {
      const f = fichas.get(c.asin!);
      const k = kits.get(c.asin!);
      return {
        asin: c.asin!,
        marca: f?.summaries?.[0]?.brand ?? c.marca,
        titulo: f?.summaries?.[0]?.itemName ?? c.titulo,
        imagen: fotoPrincipal(f),
        precio: precios.get(c.asin!)?.precio ?? null,
        precioXray: c.precio || null,
        moneda: m.moneda,
        ventasMes: c.ventas,
        facturacion: c.facturacion,
        resenas: c.resenas,
        valoracion: c.valoracion ?? null,
        elementos: (k?.elementos ?? []).map((e) => ({ cantidad: e.cantidad ?? null, nombre: String(e.nombre).trim(), detalle: e.detalle?.trim() || null })).filter((e) => e.nombre),
        otroProducto: k?.otroProducto?.trim() || null,
      };
    });
  }
  const kits: KitsCompetidores = { generadoEn: new Date().toISOString(), porPais };
  await guardarKitsCompetidores(id, kits);
  return kits;
}
