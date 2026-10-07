import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { limpiarEnv } from "@/lib/env";
import type { MapaPalabras, MapaXray } from "@/lib/datos/h10Csv";
import { esCodigoPais, esHerramienta, HERRAMIENTAS_H10, type CodigoPais, type HerramientaH10 } from "@/lib/datos/h10Tipos";

/*
 * Claude reads Helium 10 files for the «Análisis H10» studies:
 * - a CSV export: from its header and a few rows it says which tool and country it is and which column is which
 *   (the figures are then read from the file itself, see h10Csv.ts);
 * - a screenshot: it reads the data straight from the image.
 * Answers follow a JSON schema (structured outputs).
 */

const apiKey = limpiarEnv(process.env.ANTHROPIC_API_KEY);
let cliente: Anthropic | null = null;
const conectar = () => {
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY en las variables de entorno para leer los archivos con IA");
  cliente ??= new Anthropic({ apiKey });
  return cliente;
};

export type Pista = { codigoPais: CodigoPais | null; herramienta: HerramientaH10 | null };

const HERRAMIENTAS = HERRAMIENTAS_H10.map((h) => h.id);
const PAISES = ["ES", "DE", "FR", "IT", "GB", "desconocido"];
// The API allows at most 16 nullable fields per schema: CSV column names use "" for «not there» instead of null.
const columnaCsv = { type: "string", description: "Nombre exacto de la cabecera, o cadena vacía si no existe" };
const numeroONulo = { type: ["number", "null"] };

const COMUN = `Eres un experto en Helium 10 y Amazon. Identificas archivos de Helium 10 de un vendedor que estudia productos en Amazon Europa.
Herramientas:
- xray: análisis de una búsqueda: tabla de productos con Price, Sales/ASIN Sales, Revenue/ASIN Revenue, Reviews, BSR; cabecera con Search Volume, Total Revenue, Average Price…
- cerebro: palabras clave de uno o varios ASIN: Keyword Phrase, Search Volume, CPR, Title Density, Organic Rank y una columna de posición por ASIN.
- magnet: variantes de una palabra clave: Keyword Phrase, Magnet IQ Score, Search Volume, Competing Products…
- resenas: reseñas de clientes de un producto.
- historial: gráficas de Helium 10 con la evolución de ventas, precio o BSR de un producto a lo largo de los meses.
- busquedas: el gráfico «Search Volume» de Helium 10: la evolución de las búsquedas de una palabra clave a lo largo de meses o años.
- calculadora: calculadora de beneficios / Revenue Calculator de Amazon (tarifas, precio, beneficio).
- ficha: la página de un producto en Amazon (fotos, título, viñetas, descripción, A+).
- restricciones: Seller Central al añadir un producto: si la categoría o la marca necesita aprobación.
- proveedor: presupuesto, proforma o anuncio de un proveedor (Alibaba…) con precio por unidad o cantidad mínima.
- envio: presupuesto de transporte o de un transitario (flete, aduana, aranceles).
- medidas: ficha técnica con las medidas y el peso de la caja del producto.
- certificados: certificados de conformidad o ensayos (CE, EN 71, REACH…).
- otro: cualquier otra cosa.
País: por la moneda y el idioma (£ o amazon.co.uk → GB; € con alemán → DE, francés → FR, italiano → IT, español → ES). Si no se puede saber, «desconocido».
Si el usuario indica país o herramienta, úsalos.`;

function pistaTexto(p: Pista, nombre: string): string {
  return `Nombre del archivo: «${nombre}».${p.herramienta ? ` El usuario dice que es de: ${p.herramienta}.` : ""}${p.codigoPais ? ` El usuario dice que el país es: ${p.codigoPais}.` : ""}`;
}

async function pedir<T>(system: string, contenido: Anthropic.Beta.BetaContentBlockParam[], schema: Record<string, unknown>, esfuerzo: "medium" | "high" = "medium"): Promise<T> {
  const r = await conectar().beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: esfuerzo, format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: contenido }],
  });
  if (r.stop_reason === "refusal") throw new Error("La IA no quiso leer este archivo");
  if (r.stop_reason === "max_tokens") throw new Error("El archivo tiene demasiados datos para leerlo de una vez");
  const t = r.content.find((b) => b.type === "text")?.text;
  if (!t) throw new Error("La IA no devolvió datos");
  return JSON.parse(t) as T;
}

const normalizar = (codigo: string, herramienta: string, pista: Pista) => ({
  codigoPais: pista.codigoPais ?? (esCodigoPais(codigo) ? codigo : null),
  herramienta: pista.herramienta ?? (esHerramienta(herramienta) ? herramienta : "otro"),
});

// ---------- CSV ----------

export type CsvReconocido = {
  herramienta: HerramientaH10;
  codigoPais: CodigoPais | null;
  moneda: "EUR" | "GBP";
  palabraClave: string;
  xray: MapaXray;
  palabras: MapaPalabras;
};

const ESQUEMA_CSV = {
  type: "object",
  properties: {
    herramienta: { type: "string", enum: HERRAMIENTAS },
    codigoPais: { type: "string", enum: PAISES },
    moneda: { type: "string", enum: ["EUR", "GBP"] },
    palabraClave: { type: "string", description: "La búsqueda analizada si se deduce (p. ej. del nombre del archivo); si no, cadena vacía" },
    xray: {
      type: "object",
      description: "Solo si es xray: el nombre EXACTO de la cabecera de cada dato, o cadena vacía si no existe",
      properties: {
        ...Object.fromEntries(["titulo", "asin", "marca", "precio", "resenas", "valoracion", "bsr", "tarifaFba", "tamano", "peso"].map((k) => [k, columnaCsv])),
        // The parent-level columns repeat the whole listing family's figures on every variant: adding them up
        // counts the same sales several times (Helium 10's own «Total Revenue» does).
        ventas: { ...columnaCsv, description: "La columna «ASIN Sales» (ventas de esa variante). NUNCA «Parent Level Sales». Cadena vacía si no existe" },
        facturacion: { ...columnaCsv, description: "La columna «ASIN Revenue» (facturación de esa variante). NUNCA «Parent Level Revenue». Solo si no existe ASIN Revenue, «Revenue». Cadena vacía si no hay" },
      },
      required: ["titulo", "asin", "marca", "precio", "ventas", "facturacion", "resenas", "valoracion", "bsr", "tarifaFba", "tamano", "peso"],
      additionalProperties: false,
    },
    palabras: {
      type: "object",
      description: "Solo si es cerebro o magnet: el nombre EXACTO de la cabecera de cada dato, o cadena vacía",
      properties: {
        ...Object.fromEntries(["palabra", "busquedas", "tendencia", "competidores", "cpr", "densidad", "puja"].map((k) => [k, columnaCsv])),
        posiciones: { type: "array", items: { type: "string" }, description: "Cabeceras con la posición orgánica de cada competidor (en Cerebro, una por ASIN)" },
      },
      required: ["palabra", "busquedas", "tendencia", "competidores", "cpr", "densidad", "puja", "posiciones"],
      additionalProperties: false,
    },
  },
  required: ["herramienta", "codigoPais", "moneda", "palabraClave", "xray", "palabras"],
  additionalProperties: false,
};

/** Which tool and country a CSV export is, and which header holds each field. */
export async function reconocerCsv(nombre: string, filas: string[][], pista: Pista): Promise<CsvReconocido> {
  const muestra = filas.slice(0, 6).map((f) => f.map((c) => c.slice(0, 80)).join(" | ")).join("\n");
  const r = await pedir<Omit<CsvReconocido, "codigoPais" | "herramienta"> & { codigoPais: string; herramienta: string }>(
    `${COMUN}\nTe paso la cabecera y las primeras filas de una exportación CSV. Di qué es y en qué columna está cada dato (copia el nombre de la cabecera tal cual).`,
    [{ type: "text", text: `${pistaTexto(pista, nombre)}\n\nPrimeras filas (separadas por |):\n${muestra}` }],
    ESQUEMA_CSV,
  );
  const nulos = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v])) as T;
  return { ...r, xray: nulos(r.xray), palabras: nulos(r.palabras), ...normalizar(r.codigoPais, r.herramienta, pista) };
}

// ---------- Screenshots ----------

export type CapturaLeida = {
  herramienta: HerramientaH10;
  codigoPais: CodigoPais | null;
  moneda: "EUR" | "GBP";
  palabraClave: string;
  cabecera: {
    busquedas: number | null;
    facturacionTotal: number | null;
    facturacionMedia: number | null;
    precioMedio: number | null;
    bsrMedio: number | null;
    resenasMedias: number | null;
    top10Mas5000: number | null;
    top10Menos75: number | null;
    asins: number | null;
  };
  competidores: { puesto: number; titulo: string; marca: string; precio: number; ventas: number | null; facturacion: number; resenas: number; variacionResenas: number; etiquetas: string[] }[];
  palabras: { texto: string; busquedas: number; tendencia: number | null; competidores: number | null; cpr: number | null; densidadTitulos: number | null; pujaPpc: number | null }[];
  descripcion: string;
};

const ESQUEMA_CAPTURA = {
  type: "object",
  properties: {
    herramienta: { type: "string", enum: HERRAMIENTAS },
    codigoPais: { type: "string", enum: PAISES },
    moneda: { type: "string", enum: ["EUR", "GBP"] },
    palabraClave: { type: "string", description: "La búsqueda o el producto analizado; cadena vacía si no aparece" },
    cabecera: {
      type: "object",
      description: "Solo xray: las métricas de la cabecera (null si no aparecen)",
      properties: Object.fromEntries(["busquedas", "facturacionTotal", "facturacionMedia", "precioMedio", "bsrMedio", "resenasMedias", "top10Mas5000", "top10Menos75", "asins"].map((k) => [k, numeroONulo])),
      required: ["busquedas", "facturacionTotal", "facturacionMedia", "precioMedio", "bsrMedio", "resenasMedias", "top10Mas5000", "top10Menos75", "asins"],
      additionalProperties: false,
    },
    competidores: {
      type: "array",
      description: "Solo xray: cada fila visible de la tabla",
      items: {
        type: "object",
        properties: {
          puesto: { type: "number", description: "Número de la columna #" },
          titulo: { type: "string" },
          marca: { type: "string", description: "La marca, normalmente la primera palabra del título si es un nombre comercial; «Genérico» si no hay" },
          precio: { type: "number" },
          ventas: { type: ["number", "null"], description: "ASIN Sales si existe la columna" },
          facturacion: { type: "number", description: "ASIN Revenue" },
          resenas: { type: "number" },
          variacionResenas: { type: "number", description: "El número entre paréntesis junto a las reseñas (+12 → 12, -24 → -24); 0 si no hay" },
          etiquetas: { type: "array", items: { type: "string" }, description: "Insignias como «AC» o «ABA #1»" },
        },
        required: ["puesto", "titulo", "marca", "precio", "ventas", "facturacion", "resenas", "variacionResenas", "etiquetas"],
        additionalProperties: false,
      },
    },
    palabras: {
      type: "array",
      description: "Solo cerebro o magnet: cada palabra clave visible",
      items: {
        type: "object",
        properties: {
          texto: { type: "string" },
          busquedas: { type: "number" },
          tendencia: numeroONulo,
          competidores: numeroONulo,
          cpr: numeroONulo,
          densidadTitulos: numeroONulo,
          pujaPpc: numeroONulo,
        },
        required: ["texto", "busquedas", "tendencia", "competidores", "cpr", "densidadTitulos", "pujaPpc"],
        additionalProperties: false,
      },
    },
    descripcion: { type: "string", description: "Una frase en español de lo que muestra la captura" },
  },
  required: ["herramienta", "codigoPais", "moneda", "palabraClave", "cabecera", "competidores", "palabras", "descripcion"],
  additionalProperties: false,
};

// ---------- Helium 10's «Search Volume» chart ----------

export type BusquedasLeidas = { codigoPais: CodigoPais | null; palabraClave: string; meses: { mes: string; busquedas: number }[] };

const ESQUEMA_BUSQUEDAS = {
  type: "object",
  properties: {
    codigoPais: { type: "string", enum: PAISES },
    palabraClave: { type: "string", description: "La palabra clave si aparece; si no, cadena vacía" },
    meses: {
      type: "array",
      description: "Un valor por mes, del primer mes que se ve al último, sin saltarse ninguno",
      items: {
        type: "object",
        properties: {
          mes: { type: "string", description: "AAAA-MM" },
          busquedas: { type: "number", description: "Búsquedas de ese mes: la media de los puntos de la línea dentro de ese mes, leída con la escala del eje Y" },
        },
        required: ["mes", "busquedas"],
        additionalProperties: false,
      },
    },
  },
  required: ["codigoPais", "palabraClave", "meses"],
  additionalProperties: false,
};

/**
 * Reads Helium 10's «Search Volume» chart: the keyword's searches month by month. `hoy` (YYYY-MM-DD) places the
 * last point, since the axis shows only months like «1/24».
 */
export async function leerBusquedas(datos: Buffer, tipo: TipoImagen, nombre: string, pista: Pista, hoy: string): Promise<BusquedasLeidas> {
  const r = await pedir<Omit<BusquedasLeidas, "codigoPais"> & { codigoPais: string }>(
    `Lees el gráfico «Search Volume» de Helium 10: la evolución de las búsquedas mensuales de una palabra clave en Amazon.
Cómo situar los meses, paso a paso:
1. Localiza la posición horizontal de cada marca del eje X («1/24» = 1 de enero de 2024, «7/24» = 1 de julio de 2024, «1/25»…). Entre dos marcas seguidas hay 6 meses: cada mes ocupa una sexta parte de esa distancia, empezando en la marca.
2. El último punto de la línea es el mes actual (hoy es ${hoy}); el primero, el mes que caiga en su posición.
3. Para cada mes, mira solo el tramo de la línea dentro de ese mes y da la media de sus puntos con la escala del eje Y.
4. Comprueba los picos: un pico justo a la IZQUIERDA de «1/25» es de diciembre de 2024, no de enero ni de noviembre. Vuelve a revisar que cada pico y cada valle quedan en el mes de su posición.
Un valor por mes, del primero al último, sin saltarse ninguno ni inventar meses fuera del gráfico.`,
    [
      { type: "image", source: { type: "base64", media_type: tipo, data: datos.toString("base64") } },
      { type: "text", text: pistaTexto(pista, nombre) },
    ],
    ESQUEMA_BUSQUEDAS,
    // Placing each month on a chart takes careful reading.
    "high",
  );
  const meses = r.meses.filter((m) => /^\d{4}-\d{2}$/.test(m.mes) && Number.isFinite(m.busquedas)).map((m) => ({ mes: m.mes, busquedas: Math.max(0, Math.round(m.busquedas)) }));
  return { palabraClave: r.palabraClave, meses, codigoPais: pista.codigoPais ?? (esCodigoPais(r.codigoPais) ? r.codigoPais : null) };
}

// ---------- Competitors' review topics, grouped ----------

/** One topic of one competitor, numbered so the AI can refer to it. */
export type TemaParaAgrupar = { n: number; pais: string; producto: string; tipo: "queja" | "elogio"; tema: string; menciones: number; ejemplos: string[] };

const ESQUEMA_AGRUPAR = {
  type: "object",
  properties: {
    temas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          texto: { type: "string", description: "El tema en español, corto (2–6 palabras), p. ej. «Montaje complicado» o «Buena calidad general»" },
          tipo: { type: "string", enum: ["queja", "elogio"] },
          mejora: { type: "string", description: "Solo quejas: qué debería hacer tu producto para evitarla, en una frase concreta. Para elogios, cadena vacía" },
          fuentes: { type: "array", items: { type: "integer" }, description: "Los números (n) de los temas de los competidores que reúne" },
        },
        required: ["texto", "tipo", "mejora", "fuentes"],
        additionalProperties: false,
      },
    },
  },
  required: ["temas"],
  additionalProperties: false,
};

/**
 * Puts together the review topics Helium 10 found in each competitor (in German, French, English…) into common themes
 * in Spanish, with what your product should do about each complaint.
 */
export async function agruparTemasResenas(producto: string, temas: TemaParaAgrupar[]): Promise<{ texto: string; tipo: "queja" | "elogio"; mejora: string; fuentes: number[] }[]> {
  const lista = temas
    .map((t) => `${t.n}. [${t.tipo}] ${t.pais} · ${t.producto} · «${t.tema}» (${t.menciones} menciones)${t.ejemplos.length ? ` · ejemplos: ${t.ejemplos.map((e) => `«${e}»`).join(" ")}` : ""}`)
    .join("\n");
  const r = await pedir<{ temas: { texto: string; tipo: "queja" | "elogio"; mejora: string; fuentes: number[] }[] }>(
    `Eres experto en producto y en Amazon. Un vendedor estudia lanzar «${producto}» y tiene el análisis de reseñas que Helium 10 hizo de sus competidores en varios países (temas en alemán, francés, inglés, español…).
Agrupa los temas que hablan de lo mismo en temas comunes, escritos en español y cortos. Las quejas y los elogios van siempre en temas distintos. Cada tema de la lista va en exactamente un tema común (usa su número en «fuentes»). Para cada queja, «mejora» dice qué debería hacer el producto del vendedor para evitarla, en una frase concreta y práctica (material, medidas, montaje, embalaje, instrucciones…).`,
    [{ type: "text", text: lista }],
    ESQUEMA_AGRUPAR,
  );
  return r.temas;
}

// ---------- Amazon's revenue calculator ----------

export type CalculadoraLeida = {
  codigoPais: CodigoPais | null;
  moneda: "EUR" | "GBP";
  asin: string;
  producto: string;
  precio: number;
  comision: number;
  tarifaFba: number;
  almacenamientoMes: number;
  iva: number;
  peso: string;
  dimensiones: string;
};

const ESQUEMA_CALCULADORA = {
  type: "object",
  properties: {
    codigoPais: { type: "string", enum: PAISES, description: "La «Tienda de Amazon» elegida (DE, ES…)" },
    moneda: { type: "string", enum: ["EUR", "GBP"] },
    asin: { type: "string" },
    producto: { type: "string", description: "Título del producto, abreviado" },
    precio: { type: "number", description: "Precio del producto en la columna «Logística de Amazon»" },
    comision: { type: "number", description: "Tarifa por referencia" },
    tarifaFba: { type: "number", description: "Tarifas de gestión logística" },
    almacenamientoMes: { type: "number", description: "Coste mensual de almacenamiento por unidad (enero a septiembre)" },
    iva: { type: "number", description: "IVA estimado, en % (19 en Alemania)" },
    peso: { type: "string", description: "Peso unitario tal cual aparece" },
    dimensiones: { type: "string", description: "Dimensiones del paquete tal cual aparecen" },
  },
  required: ["codigoPais", "moneda", "asin", "producto", "precio", "comision", "tarifaFba", "almacenamientoMes", "iva", "peso", "dimensiones"],
  additionalProperties: false,
};

/** Reads a screenshot of Amazon's revenue calculator (the «Logística de Amazon» column). */
export async function leerCalculadora(datos: Buffer, tipo: TipoImagen, nombre: string, pista: Pista): Promise<CalculadoraLeida> {
  const r = await pedir<Omit<CalculadoraLeida, "codigoPais"> & { codigoPais: string }>(
    "Lees capturas de la calculadora de ingresos de Amazon (Revenue Calculator) de un vendedor europeo. Copia los importes de la columna «Logística de Amazon» como números (13,50 € → 13.5). Si un dato no aparece, pon 0 o cadena vacía.",
    [
      { type: "image", source: { type: "base64", media_type: tipo, data: datos.toString("base64") } },
      { type: "text", text: pistaTexto(pista, nombre) },
    ],
    ESQUEMA_CALCULADORA,
  );
  return { ...r, codigoPais: pista.codigoPais ?? (esCodigoPais(r.codigoPais) ? r.codigoPais : null) };
}

export const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type TipoImagen = (typeof TIPOS_IMAGEN)[number];
export const esImagen = (t: string): t is TipoImagen => (TIPOS_IMAGEN as readonly string[]).includes(t);

/** Reads a screenshot (or a PDF): what it is, which country, and the data it shows. */
export async function leerCaptura(datos: Buffer, tipo: TipoImagen | "application/pdf", nombre: string, pista: Pista): Promise<CapturaLeida> {
  const r = await pedir<Omit<CapturaLeida, "codigoPais" | "herramienta"> & { codigoPais: string; herramienta: string }>(
    `${COMUN}\nLee la captura de pantalla o el documento. Copia los números tal cual se ven (como números, sin símbolos; 1.234,56 € → 1234.56). Solo lo visible: no inventes filas. Rellena solo la parte que corresponde a la herramienta; las demás, vacías.`,
    [
      tipo === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: datos.toString("base64") } }
        : { type: "image", source: { type: "base64", media_type: tipo, data: datos.toString("base64") } },
      { type: "text", text: pistaTexto(pista, nombre) },
    ],
    ESQUEMA_CAPTURA,
  );
  return { ...r, ...normalizar(r.codigoPais, r.herramienta, pista) };
}
