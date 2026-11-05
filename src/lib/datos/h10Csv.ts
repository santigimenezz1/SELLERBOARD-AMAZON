import type { CodigoPais, CompetidorXray, MercadoXray, ResenaCompleta } from "./h10Tipos";

/** Most reviews kept per file, and the characters of text in all (a stored document can't pass 1 MB). */
const MAX_RESENAS = 3000;
const MAX_TEXTO_TOTAL = 700_000;

/**
 * Every review of a product exported as CSV (Helium 10's «Review Downloader»): stars, title, text, date… in the
 * original language. Columns are found by their name, so similar exports work too. Null when the file isn't one.
 */
export function resenasDesdeCsv(filas: string[][], nombreArchivo: string): { asin: string | null; resenas: ResenaCompleta[] } | null {
  const [cab, ...datos] = filas;
  const col = (re: RegExp) => cab.findIndex((c) => re.test(c.trim()));
  const iEstrellas = col(/^(rating|stars?|review rating|estrellas|valoraci[oó]n|bewertung|note)$/i);
  const iTexto = col(/^(body|review|review text|review body|content|text|comment|texto|rese[ñn]a)$/i);
  if (iEstrellas < 0 || iTexto < 0) return null;
  const iTitulo = col(/title|t[ií]tulo/i);
  const iFecha = col(/date|fecha|datum/i);
  const iVerificada = col(/verified|verificad/i);
  const iVariante = col(/variation|variant|style|variante/i);
  const iAutor = col(/author|reviewer|^name$|autor/i);
  const iUtil = col(/helpful|[uú]til/i);
  const iUrl = col(/url|link/i);
  // Older ASINs start «B07…», «B08…» too, not only «B0…»: any «B» + digit + 8, not glued to other letters or digits.
  const ASIN = /(?<![A-Z0-9])B\d[A-Z0-9]{8}(?![A-Z0-9])/;
  const asin = nombreArchivo.toUpperCase().match(ASIN)?.[0] ?? datos.map((f) => f[iUrl] ?? "").join(" ").match(ASIN)?.[0] ?? null;
  const resenas: ResenaCompleta[] = [];
  let caracteres = 0;
  for (const f of datos) {
    const n = Math.round(Number((f[iEstrellas] ?? "").replace(",", ".").match(/\d+(\.\d+)?/)?.[0]));
    const texto = (f[iTexto] ?? "").trim().slice(0, 1500);
    // A row without its stars (or with something else there) isn't a review that can be counted.
    if (!Number.isFinite(n) || n < 1 || n > 5 || (!texto && !(f[iTitulo] ?? "").trim())) continue;
    caracteres += texto.length;
    if (resenas.length >= MAX_RESENAS || caracteres > MAX_TEXTO_TOTAL) break;
    const si = (f[iVerificada] ?? "").trim().toLowerCase();
    resenas.push({
      fecha: iFecha >= 0 ? (f[iFecha] ?? "").trim() || null : null,
      estrellas: n as ResenaCompleta["estrellas"],
      titulo: iTitulo >= 0 ? (f[iTitulo] ?? "").trim().slice(0, 200) : "",
      texto,
      verificada: iVerificada < 0 || !si ? null : /^(yes|true|1|s[ií]|verified)/.test(si),
      variante: iVariante >= 0 ? (f[iVariante] ?? "").trim() || null : null,
      autor: iAutor >= 0 ? (f[iAutor] ?? "").trim().slice(0, 60) || null : null,
      util: iUtil >= 0 && Number.isFinite(parseInt(f[iUtil] ?? "", 10)) ? parseInt(f[iUtil], 10) : null,
    });
  }
  return resenas.length ? { asin, resenas } : null;
}

/*
 * Reading Helium 10 CSV exports. The AI only says which column is which (exports differ by tool, plan and
 * language); the figures are read here from the file itself, so they are exact.
 */

/** CSV text → rows of cells. Handles quotes, «;», «,» or tab separators and a leading BOM. */
/**
 * Helium 10's «Search Volume» chart exported as CSV (Time; Search Volume, one point a week): the searches of each
 * month as the average of its weeks. Null when the file isn't that export.
 */
export function historialDesdeCsv(filas: string[][]): { meses: { mes: string; busquedas: number }[]; semanas: { dia: string; busquedas: number }[] } | null {
  const [cabecera, ...datos] = filas;
  const iFecha = cabecera.findIndex((c) => /^(time|date|fecha)$/i.test(c.trim()));
  const iBusquedas = cabecera.findIndex((c) => /search volume|volumen de b/i.test(c));
  if (iFecha < 0 || iBusquedas < 0 || cabecera.length > 4) return null;
  const porMes = new Map<string, number[]>();
  const semanas: { dia: string; busquedas: number }[] = [];
  for (const f of datos) {
    const mes = f[iFecha]?.match(/^(\d{4})-(\d{2})-(\d{2})/);
    // «12.345», «12,345» or «12345»: searches are whole numbers, so every separator is a thousands one.
    const v = Number(String(f[iBusquedas] ?? "").replace(/[.,\s]/g, ""));
    if (!mes || !String(f[iBusquedas] ?? "").trim() || !Number.isFinite(v)) continue;
    porMes.set(`${mes[1]}-${mes[2]}`, [...(porMes.get(`${mes[1]}-${mes[2]}`) ?? []), v]);
    semanas.push({ dia: `${mes[1]}-${mes[2]}-${mes[3]}`, busquedas: v });
  }
  if (porMes.size < 3) return null;
  return {
    meses: [...porMes].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, v]) => ({ mes, busquedas: Math.round(v.reduce((s, x) => s + x, 0) / v.length) })),
    semanas: semanas.sort((a, b) => a.dia.localeCompare(b.dia)),
  };
}

export function leerCsv(texto: string): string[][] {
  texto = texto.replace(/^﻿/, "");
  const fin = texto.indexOf("\n");
  const primera = fin >= 0 ? texto.slice(0, fin) : texto;
  const sep = [",", ";", "\t"].map((c) => ({ c, n: primera.split(c).length })).sort((a, b) => b.n - a.n)[0].c;
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (ch === '"') comillas = false;
      else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) {
      fila.push(celda);
      celda = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda);
      if (fila.some((c) => c.trim())) filas.push(fila.map((c) => c.trim()));
      fila = [];
      celda = "";
    } else celda += ch;
  }
  fila.push(celda);
  if (fila.some((c) => c.trim())) filas.push(fila.map((c) => c.trim()));
  return filas;
}

/**
 * A number as Helium 10 writes it, in any locale: «1.234,56 €», «£1,234.56», «29,99», «12%», «-», «N/A».
 * null when there's no number.
 */
export function numero(v: string | undefined | null): number | null {
  if (!v) return null;
  let s = v.replace(/[^\d.,\-]/g, "");
  if (!/\d/.test(s)) return null;
  const coma = s.lastIndexOf(",");
  const punto = s.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    // Both: the last one is the decimal separator.
    s = coma > punto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (coma >= 0) {
    // Only commas: «1,234» / «1,234,567» are thousands; «29,99» is a decimal.
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (punto >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // «8.259», «1.234.567»: European thousands (prices, ratings and fees never have three decimals).
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Which header holds each field (null = the export doesn't have it). Filled in by the AI. */
export type MapaXray = {
  titulo: string | null;
  asin: string | null;
  marca: string | null;
  precio: string | null;
  ventas: string | null;
  facturacion: string | null;
  resenas: string | null;
  valoracion: string | null;
  bsr: string | null;
  tarifaFba: string | null;
  tamano: string | null;
  peso: string | null;
};
export type MapaPalabras = {
  palabra: string | null;
  busquedas: string | null;
  tendencia: string | null;
  competidores: string | null;
  cpr: string | null;
  densidad: string | null;
  puja: string | null;
  /** Columns that hold a competitor's organic rank (Cerebro: one per ASIN). */
  posiciones: string[];
} & Partial<Record<ExtraPalabra, string | null>>;

/** Cerebro columns beyond the basic ones (only read when the headers are recognised by name). */
type ExtraPalabra = "ventas" | "iq" | "anunciantes" | "clicsAba" | "conversionAba" | "rangoCompetidores" | "competidoresPosicionados" | "rendimientoCompetidores";

/**
 * Cerebro and Magnet headers as Helium 10 exports them, in English and in Spanish: each column is found by its exact
 * name (no AI). A competitor's rank column is headed by its ASIN.
 */
const CABECERAS_PALABRAS: Record<Exclude<keyof MapaPalabras, "posiciones">, string[]> = {
  palabra: ["Keyword Phrase", "Frase clave", "Frase de palabras clave", "Palabra clave"],
  busquedas: ["Search Volume", "Volumen de búsqueda", "Volumen de busqueda"],
  tendencia: ["Search Volume Trend", "Tendencia del volumen de búsqueda", "Tendencia del volumen de busqueda"],
  competidores: ["Competing Products", "Productos competidores"],
  cpr: ["CPR"],
  densidad: ["Title Density", "Densidad del título", "Densidad del titulo"],
  puja: ["H10 PPC Sugg. Bid", "Suggested PPC Bid", "PPC Sugg. Bid", "Puja PPC sugerida", "Puja sugerida de PPC de H10"],
  ventas: ["Keyword Sales", "Venta de palabras clave", "Ventas de palabras clave"],
  iq: ["Cerebro IQ Score", "Puntuación IQ Cerebro", "Magnet IQ Score", "Puntuación IQ Magnet"],
  anunciantes: ["Sponsored ASINs", "ASIN auspiciados", "ASIN patrocinados"],
  clicsAba: ["ABA Total Click Share", "Cuota total de clics ABA"],
  conversionAba: ["ABA Total Conv. Share", "Cuota total de conversión ABA"],
  rangoCompetidores: ["Competitor Rank (avg)", "Clasificación de competidores (promed.)"],
  competidoresPosicionados: ["Ranking Competitors (count)", "Competidores de la clasificación (recuento)"],
  rendimientoCompetidores: ["Competitor Performance Score", "Puntuación del rendimiento de los competidores"],
};
const plano = (t: string) => t.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

/**
 * A Cerebro or Magnet export recognised by its headers alone: which tool it is and where each column is. null when it
 * doesn't look like one (then the AI looks at it).
 */
export function palabrasConocidas(cabecera: string[]): { herramienta: "cerebro" | "magnet"; mapa: MapaPalabras } | null {
  const cab = cabecera.map(plano);
  const buscar = (nombres: string[]) => {
    const i = cab.findIndex((c) => nombres.some((n) => plano(n) === c));
    return i >= 0 ? cabecera[i] : null;
  };
  const mapa = Object.fromEntries(Object.entries(CABECERAS_PALABRAS).map(([k, v]) => [k, buscar(v)])) as Omit<MapaPalabras, "posiciones">;
  if (!mapa.palabra || !mapa.busquedas) return null;
  return {
    herramienta: cab.some((c) => c.includes("magnet")) ? "magnet" : "cerebro",
    mapa: { ...mapa, posiciones: cabecera.filter((c) => /^B0[A-Z0-9]{8}$/i.test(c.trim())) } as MapaPalabras,
  };
}

/**
 * Helium 10's «Word Frequency» export (Cerebro → Word Frequency, or Frankenstein): how often each single word shows up
 * in the competitors' keywords. It's not a Cerebro: it has no searches. null when it isn't one.
 */
export function frecuenciaDesdeCsv(filas: string[][]): { palabra: string; veces: number }[] | null {
  const [cab, ...datos] = filas;
  const c = cab.map(plano);
  if (c.length > 3 || !["word", "palabra"].includes(c[0] ?? "") || !["frequency", "frecuencia"].includes(c[1] ?? "")) return null;
  return datos
    .map((f) => ({ palabra: (f[0] ?? "").trim().toLowerCase(), veces: Math.round(numero(f[1]) ?? 0) }))
    .filter((x) => x.palabra)
    .sort((a, b) => b.veces - a.veces)
    .slice(0, 2000);
}

const columna = (cabecera: string[], nombre: string | null) => (nombre ? cabecera.findIndex((c) => c.trim().toLowerCase() === nombre.trim().toLowerCase()) : -1);
const redondear = (v: number) => Math.round(v * 100) / 100;

/** An Xray export → the market of that keyword in that country, worked out like the Xray header does. */
export function mercadoDesdeCsv(filas: string[][], mapa: MapaXray, info: { codigoPais: CodigoPais; moneda: "EUR" | "GBP"; palabraClave: string; fecha: string }): MercadoXray {
  const [cab, ...datos] = filas;
  const i = Object.fromEntries(Object.entries(mapa).map(([k, v]) => [k, columna(cab, v as string | null)])) as Record<keyof MapaXray, number>;
  const txt = (f: string[], k: keyof MapaXray) => (i[k] >= 0 ? (f[i[k]] ?? "").trim() : "");
  const num = (f: string[], k: keyof MapaXray) => (i[k] >= 0 ? numero(f[i[k]]) : null);

  const competidores: CompetidorXray[] = datos
    .map((f, n) => ({
      puesto: n + 1,
      titulo: txt(f, "titulo").slice(0, 200),
      marca: txt(f, "marca") || "Genérico",
      precio: num(f, "precio") ?? 0,
      ventas: num(f, "ventas"),
      facturacion: num(f, "facturacion") ?? 0,
      resenas: num(f, "resenas") ?? 0,
      variacionResenas: 0,
      etiquetas: [],
      asin: txt(f, "asin") || null,
      valoracion: num(f, "valoracion"),
      bsr: num(f, "bsr"),
      tarifaFba: num(f, "tarifaFba"),
      tamano: txt(f, "tamano") || null,
      peso: txt(f, "peso") || null,
    }))
    .filter((c) => c.titulo || c.asin);

  const porFacturacion = [...competidores].sort((a, b) => b.facturacion - a.facturacion);
  const top10 = porFacturacion.slice(0, 10);
  const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const total = competidores.reduce((s, c) => s + c.facturacion, 0);
  const bsrs = competidores.map((c) => c.bsr).filter((b): b is number => !!b);
  return {
    ...info,
    busquedas: null,
    facturacionTotal: redondear(total),
    facturacionMedia: redondear(competidores.length ? total / competidores.length : 0),
    precioMedio: redondear(media(competidores.filter((c) => c.precio > 0).map((c) => c.precio))),
    bsrMedio: Math.round(media(bsrs)),
    resenasMedias: Math.round(media(competidores.map((c) => c.resenas))),
    top10Mas5000: top10.filter((c) => c.facturacion > 5000).length,
    top10Menos75: top10.filter((c) => c.resenas < 75).length,
    asins: competidores.length,
    competidores: porFacturacion.map((c, n) => ({ ...c, puesto: n + 1 })),
  };
}

/** A keyword as read from a file. null = the file doesn't have that column (no data, not 0). */
export type FilaPalabra = {
  texto: string;
  busquedas: number;
  tendencia: number | null;
  competidores: number | null;
  cpr: number | null;
  densidadTitulos: number | null;
  pujaPpc: number | null;
  /** Estimated monthly sales coming through this keyword (Cerebro «Keyword Sales»). */
  ventas?: number | null;
  /** Cerebro (or Magnet) IQ Score: searches against competition, higher is better. */
  iq?: number | null;
  /** How many products advertise on it («Sponsored ASINs»). */
  anunciantes?: number | null;
  /** Amazon Brand Analytics: % of the clicks and of the purchases taken by the top 3 products. */
  clicsAba?: number | null;
  conversionAba?: number | null;
  /** The tracked competitors' average rank on it, and how many of them rank. */
  rangoCompetidores?: number | null;
  competidoresPosicionados?: number | null;
  /** Cerebro's «Competitor Performance Score» (1–10): how well the tracked competitors do on it. */
  rendimientoCompetidores?: number | null;
  /** Rank by competitor column (header, e.g. an ASIN): null = not ranked. */
  posiciones: Record<string, number | null>;
};
/** The optional figures of a keyword, in the order they're read. */
export const EXTRAS_PALABRA = ["ventas", "iq", "anunciantes", "clicsAba", "conversionAba", "rangoCompetidores", "competidoresPosicionados", "rendimientoCompetidores"] as const;

/** Most keywords kept per file: exports can have thousands, the long tail adds little. */
const MAX_PALABRAS = 2000;

/** A Cerebro or Magnet export → its keywords, most searched first. */
export function palabrasDesdeCsv(filas: string[][], mapa: MapaPalabras): { columnasPosicion: string[]; filas: FilaPalabra[] } {
  const [cab, ...datos] = filas;
  const col = (k: Exclude<keyof MapaPalabras, "posiciones">) => columna(cab, mapa[k] ?? null);
  const ip = { palabra: col("palabra"), busquedas: col("busquedas"), tendencia: col("tendencia"), competidores: col("competidores"), cpr: col("cpr"), densidad: col("densidad"), puja: col("puja") };
  const extras = EXTRAS_PALABRA.map((k) => [k, col(k)] as const).filter(([, i]) => i >= 0);
  const posiciones = mapa.posiciones.map((nombre) => ({ nombre, i: columna(cab, nombre) })).filter((p) => p.i >= 0);
  // A missing column is no data (null), not 0; neither is a «-» or «N/A» in a cell.
  const num = (f: string[], i: number) => (i >= 0 ? numero(f[i]) : null);
  const entero = (v: number | null) => (v === null ? null : Math.round(v));
  const filasPalabras = datos
    .map((f) => ({
      texto: (ip.palabra >= 0 ? f[ip.palabra] : "").trim().toLowerCase(),
      busquedas: Math.round(num(f, ip.busquedas) ?? 0),
      tendencia: entero(num(f, ip.tendencia)),
      competidores: entero(num(f, ip.competidores)),
      cpr: entero(num(f, ip.cpr)),
      densidadTitulos: entero(num(f, ip.densidad)),
      pujaPpc: ((v) => (v === null ? null : redondear(v)))(num(f, ip.puja)),
      ...Object.fromEntries(extras.map(([k, i]) => [k, ((v) => (v === null ? null : redondear(v)))(num(f, i))])),
      posiciones: Object.fromEntries(
        posiciones.map((p) => {
          const n = numero(f[p.i]);
          // Cerebro writes 0 or «-» for «not ranked».
          return [p.nombre, n && n > 0 ? Math.round(n) : null];
        }),
      ),
    }))
    .filter((p) => p.texto)
    .sort((a, b) => b.busquedas - a.busquedas)
    .slice(0, MAX_PALABRAS);
  return { columnasPosicion: posiciones.map((p) => p.nombre), filas: filasPalabras };
}
