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
  const asin = nombreArchivo.match(/B0[A-Z0-9]{8}/)?.[0] ?? datos.map((f) => f[iUrl] ?? "").join(" ").match(/B0[A-Z0-9]{8}/)?.[0] ?? null;
  const resenas: ResenaCompleta[] = [];
  let caracteres = 0;
  for (const f of datos) {
    const n = Math.round(Number((f[iEstrellas] ?? "").replace(",", ".").match(/\d+(\.\d+)?/)?.[0]));
    const texto = (f[iTexto] ?? "").trim().slice(0, 1500);
    if (n < 1 || n > 5 || (!texto && !(f[iTitulo] ?? "").trim())) continue;
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
    const v = Number(String(f[iBusquedas] ?? "").replace(/[.\s]/g, "").replace(",", "."));
    if (!mes || !Number.isFinite(v)) continue;
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
};

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

export type FilaPalabra = {
  texto: string;
  busquedas: number;
  tendencia: number;
  competidores: number;
  cpr: number;
  densidadTitulos: number;
  pujaPpc: number;
  /** Rank by competitor column (header, e.g. an ASIN): null = not ranked. */
  posiciones: Record<string, number | null>;
};

/** Most keywords kept per file: exports can have thousands, the long tail adds little. */
const MAX_PALABRAS = 2000;

/** A Cerebro or Magnet export → its keywords, most searched first. */
export function palabrasDesdeCsv(filas: string[][], mapa: MapaPalabras): { columnasPosicion: string[]; filas: FilaPalabra[] } {
  const [cab, ...datos] = filas;
  const col = (k: Exclude<keyof MapaPalabras, "posiciones">) => columna(cab, mapa[k]);
  const ip = { palabra: col("palabra"), busquedas: col("busquedas"), tendencia: col("tendencia"), competidores: col("competidores"), cpr: col("cpr"), densidad: col("densidad"), puja: col("puja") };
  const posiciones = mapa.posiciones.map((nombre) => ({ nombre, i: columna(cab, nombre) })).filter((p) => p.i >= 0);
  const num = (f: string[], i: number) => (i >= 0 ? (numero(f[i]) ?? 0) : 0);
  const filasPalabras = datos
    .map((f) => ({
      texto: (ip.palabra >= 0 ? f[ip.palabra] : "").trim().toLowerCase(),
      busquedas: Math.round(num(f, ip.busquedas)),
      tendencia: Math.round(num(f, ip.tendencia)),
      competidores: Math.round(num(f, ip.competidores)),
      cpr: Math.round(num(f, ip.cpr)),
      densidadTitulos: Math.round(num(f, ip.densidad)),
      pujaPpc: redondear(num(f, ip.puja)),
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
