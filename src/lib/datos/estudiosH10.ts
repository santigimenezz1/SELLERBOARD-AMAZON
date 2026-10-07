import "server-only";

import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { bucket } from "./documentos";
import { contarEscrituras, contarLecturas } from "./consumo";
import { diaMadrid } from "./fechas";
import { EUR_POR_GBP, nombrePais } from "./h10Analisis";
import { historialDesdeCsv, leerCsv, mercadoDesdeCsv, palabrasDesdeCsv, type FilaPalabra } from "./h10Csv";
import { esImagen, leerBusquedas, leerCalculadora, leerCaptura, reconocerCsv, type CapturaLeida, type Pista } from "@/lib/ia/leerH10";
import { mensajeError } from "@/lib/ia/errores";
import { fichasCompetidores, ofertasCompetidor, preciosCompetidores, tarifasCompetidor } from "@/lib/amazon/apis";
import { marketplaceConocido } from "./marketplacesConocidos";
import {
  HERRAMIENTAS_H10,
  SUPUESTOS_INICIALES,
  esCodigoPais,
  type ArchivoH10,
  type CodigoPais,
  type CompetidorXray,
  type EstudioH10,
  type HerramientaH10,
  type CalculadoraAmazon,
  type SupuestosRentabilidad,
  type FichaAmazon,
  type PuntoSeguimiento,
  type SeguimientoAmazon,
  PAISES_H10,
  type MercadoXray,
  type HistorialBusquedas,
  type PalabraClave,
  type PalabrasMercado,
} from "./h10Tipos";

/*
 * Stored Helium 10 studies.
 * - `estudiosH10/{id}`: name, description and the list of uploaded files.
 * - `estudiosH10/{id}/datos/{archivoId}`: what was read from each file (an Xray market or a list of keywords), so
 *   deleting a file removes exactly its data. The study shown is put together from them: per country, the latest
 *   Xray and every keyword from Cerebro and Magnet.
 * - Storage `h10/{id}/{archivoId}/{name}`: the original file, kept for good.
 * Everything is read once per server process and kept in memory.
 */

type EstudioGuardado = {
  id: string;
  nombre: string;
  descripcion: string;
  creadoEn: string;
  actualizadoEn: string;
  archivos: ArchivoH10[];
  supuestos?: SupuestosRentabilidad;
  asinsManuales?: string[];
};
type DatosArchivo = {
  herramienta: HerramientaH10;
  codigoPais: CodigoPais | null;
  mercado?: MercadoXray;
  palabras?: { columnasPosicion: string[]; filas: FilaPalabra[] };
  calculadora?: CalculadoraAmazon;
  historial?: HistorialBusquedas;
};
/** `amazon`: competitors read from Amazon, by «country|ASIN» (stored in `estudiosH10/{id}/amazon/{country}_{ASIN}`). */
type Entrada = { estudio: EstudioGuardado; datos: Map<string, DatosArchivo>; amazon: Map<string, SeguimientoAmazon> };

export const TAMANO_MAXIMO_H10 = 15 * 1024 * 1024;
/** Keywords per country sent to the page (the rest stay stored). */
const PALABRAS_EN_PAGINA = 400;
/** Competitor columns in the keyword table. */
const MAX_RIVALES = 5;

// Renamed when the cached shape changes, so a server reloaded in development doesn't reuse an old one.
const g = globalThis as unknown as { __estudiosH10v2?: Map<string, Entrada> };
const col = () => adminDb().collection("estudiosH10");
const ruta = (id: string, a: Pick<ArchivoH10, "id" | "nombre">) => `h10/${id}/${a.id}/${a.nombre}`;
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
/** «Rebounder für Fußball» → «rebounder fur fussball». */
const sinAcentos = (t: string) =>
  t
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const nombreArchivo = (n: string) => n.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(-120) || "archivo";

async function cargar(): Promise<Map<string, Entrada>> {
  if (g.__estudiosH10v2) return g.__estudiosH10v2;
  const snap = await col().get();
  contarLecturas(Math.max(snap.size, 1));
  const mapa = new Map<string, Entrada>();
  for (const d of snap.docs) {
    const [datos, amazon] = await Promise.all([d.ref.collection("datos").get(), d.ref.collection("amazon").get()]);
    contarLecturas(Math.max(datos.size, 1) + Math.max(amazon.size, 1));
    mapa.set(d.id, {
      estudio: { id: d.id, ...(d.data() as Omit<EstudioGuardado, "id">) },
      datos: new Map(datos.docs.map((x) => [x.id, x.data() as DatosArchivo])),
      amazon: new Map(amazon.docs.map((x) => { const v = x.data() as SeguimientoAmazon; return [`${v.ficha.codigoPais}|${v.ficha.asin}`, v]; })),
    });
  }
  g.__estudiosH10v2 = mapa;
  return mapa;
}

async function entrada(id: string): Promise<Entrada> {
  const e = (await cargar()).get(id);
  if (!e) throw new Error("Estudio no encontrado");
  return e;
}

async function guardarEstudio(e: EstudioGuardado) {
  const { id, ...resto } = e;
  await col().doc(id).set(resto);
  contarEscrituras(1);
}

// ---------- Studies ----------

export async function crearEstudio(datos: { nombre?: unknown; descripcion?: unknown }): Promise<string> {
  const nombre = texto(datos.nombre, 80);
  if (!nombre) throw new Error("Ponle un nombre al estudio");
  const ahora = new Date().toISOString();
  const estudio: EstudioGuardado = { id: randomUUID(), nombre, descripcion: texto(datos.descripcion, 200), creadoEn: ahora, actualizadoEn: ahora, archivos: [] };
  await guardarEstudio(estudio);
  (await cargar()).set(estudio.id, { estudio, datos: new Map(), amazon: new Map() });
  return estudio.id;
}

/** A number in a range, or the current value when it isn't one. */
const cifra = (v: unknown, actual: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 100) / 100 : actual);

/** The owner's costs and assumptions of the profitability tab. */
function leerSupuestos(v: unknown, actual: SupuestosRentabilidad): SupuestosRentabilidad {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    costeFabrica: cifra(o.costeFabrica, actual.costeFabrica, 10_000),
    envioUnidad: cifra(o.envioUnidad, actual.envioUnidad, 10_000),
    conversion: Math.max(0.5, cifra(o.conversion, actual.conversion, 100)),
    devoluciones: cifra(o.devoluciones, actual.devoluciones, 100),
    mesesStock: cifra(o.mesesStock, actual.mesesStock, 36),
    lanzamiento: cifra(o.lanzamiento, actual.lanzamiento, 1_000_000),
    miCaja: (() => {
      const c = (o.miCaja && typeof o.miCaja === "object" ? o.miCaja : {}) as Record<string, unknown>;
      const n = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max ? Math.round(v * 100) / 100 : 0);
      const caja = { largo: n(c.largo, 1000), ancho: n(c.ancho, 1000), alto: n(c.alto, 1000), peso: n(c.peso, 1000) };
      return Object.values(caja).some((x) => x > 0) ? caja : actual.miCaja;
    })(),
    precios: Object.fromEntries(
      Object.entries(o.precios && typeof o.precios === "object" ? (o.precios as Record<string, unknown>) : {})
        .filter(([p, v]) => esCodigoPais(p) && typeof v === "number" && v > 0 && v < 10_000)
        .map(([p, v]) => [p, Math.round((v as number) * 100) / 100]),
    ),
  };
}

export async function editarEstudio(id: string, cambios: { nombre?: unknown; descripcion?: unknown; supuestos?: unknown }): Promise<void> {
  const e = await entrada(id);
  e.estudio = {
    ...e.estudio,
    nombre: texto(cambios.nombre, 80) || e.estudio.nombre,
    descripcion: cambios.descripcion !== undefined ? texto(cambios.descripcion, 200) : e.estudio.descripcion,
    ...(cambios.supuestos !== undefined && { supuestos: leerSupuestos(cambios.supuestos, e.estudio.supuestos ?? SUPUESTOS_INICIALES) }),
    actualizadoEn: new Date().toISOString(),
  };
  await guardarEstudio(e.estudio);
}

/** Deletes the study, what was read from its files and the files themselves. */
export async function borrarEstudio(id: string): Promise<void> {
  const e = await entrada(id);
  await bucket().deleteFiles({ prefix: `h10/${id}/` });
  for (const archivoId of e.datos.keys()) await col().doc(id).collection("datos").doc(archivoId).delete();
  for (const v of e.amazon.values()) await col().doc(id).collection("amazon").doc(idAmazon(v.ficha.codigoPais, v.ficha.asin)).delete();
  await col().doc(id).delete();
  contarEscrituras(e.datos.size + e.amazon.size + 1);
  (await cargar()).delete(id);
}

// ---------- Files ----------

/** A market from an Xray screenshot: its header figures, worked out from the rows when the capture lacks them. */
function mercadoDesdeCaptura(c: CapturaLeida, codigoPais: CodigoPais, fecha: string): MercadoXray {
  const competidores: CompetidorXray[] = c.competidores.map((x) => ({ ...x, marca: x.marca || "Genérico" }));
  const top10 = [...competidores].sort((a, b) => b.facturacion - a.facturacion).slice(0, 10);
  const total = competidores.reduce((s, x) => s + x.facturacion, 0);
  const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const k = c.cabecera;
  return {
    codigoPais,
    moneda: c.moneda,
    palabraClave: c.palabraClave || "—",
    fecha,
    busquedas: k.busquedas,
    facturacionTotal: k.facturacionTotal ?? total,
    facturacionMedia: k.facturacionMedia ?? (competidores.length ? total / competidores.length : 0),
    precioMedio: k.precioMedio ?? Math.round(media(competidores.map((x) => x.precio)) * 100) / 100,
    bsrMedio: k.bsrMedio ?? 0,
    resenasMedias: k.resenasMedias ?? Math.round(media(competidores.map((x) => x.resenas))),
    top10Mas5000: k.top10Mas5000 ?? top10.filter((x) => x.facturacion > 5000).length,
    top10Menos75: k.top10Menos75 ?? top10.filter((x) => x.resenas < 75).length,
    asins: k.asins ?? competidores.length,
    competidores,
  };
}

const nombreHerramienta = (h: HerramientaH10) => HERRAMIENTAS_H10.find((x) => x.id === h)?.nombre ?? h;

/** Reads a file (AI) and returns what goes into the study. Never throws: a file it can't read is kept with an error. */
async function procesar(archivo: File, datos: Buffer, pista: Pista, fecha: string): Promise<{ meta: Omit<ArchivoH10, "id" | "nombre" | "tipo" | "tamano" | "subidoEn">; datos: DatosArchivo | null }> {
  const sinPais = (h: HerramientaH10) => ({
    meta: { herramienta: h, codigoPais: null, estado: "error" as const, resumen: nombreHerramienta(h), error: "No sé de qué país es: bórralo y vuelve a subirlo eligiendo el país" },
    datos: null,
  });
  const guardado = (h: HerramientaH10, pais: CodigoPais | null, resumen: string) => ({
    meta: { herramienta: h, codigoPais: pais, estado: "guardado" as const, resumen: `${resumen} · se analizará en una próxima fase` },
    datos: { herramienta: h, codigoPais: pais },
  });
  try {
    const esCsv = /\.csv$/i.test(archivo.name) || archivo.type === "text/csv";
    if (esCsv) {
      const filas = leerCsv(datos.toString("utf8"));
      if (filas.length < 2) throw new Error("El CSV está vacío");
      // Helium 10's «Search Volume» chart as CSV: exact weekly figures, no AI needed.
      const semanas = historialDesdeCsv(filas);
      if (semanas) {
        if (!pista.codigoPais) return sinPais("busquedas");
        const historial: HistorialBusquedas = { codigoPais: pista.codigoPais, palabraClave: "", meses: semanas.meses, semanas: semanas.semanas, fecha };
        return {
          meta: {
            herramienta: "busquedas",
            codigoPais: pista.codigoPais,
            estado: "procesado",
            resumen: `Historial de búsquedas (CSV) · ${pista.codigoPais} · ${semanas.meses.length} meses (${semanas.meses[0].mes} a ${semanas.meses.at(-1)!.mes})`,
          },
          datos: { herramienta: "busquedas", codigoPais: pista.codigoPais, historial },
        };
      }
      const r = await reconocerCsv(archivo.name, filas, pista);
      if (r.herramienta === "xray") {
        if (!r.codigoPais) return sinPais("xray");
        const mercado = mercadoDesdeCsv(filas, r.xray, { codigoPais: r.codigoPais, moneda: r.moneda, palabraClave: r.palabraClave || "—", fecha });
        return {
          meta: { herramienta: "xray", codigoPais: r.codigoPais, estado: "procesado", palabraClave: mercado.palabraClave, resumen: `Xray · ${r.codigoPais} · ${mercado.palabraClave} · ${mercado.asins} productos` },
          datos: { herramienta: "xray", codigoPais: r.codigoPais, mercado },
        };
      }
      if (r.herramienta === "cerebro" || r.herramienta === "magnet") {
        if (!r.codigoPais) return sinPais(r.herramienta);
        const palabras = palabrasDesdeCsv(filas, r.palabras);
        return {
          meta: { herramienta: r.herramienta, codigoPais: r.codigoPais, estado: "procesado", resumen: `${nombreHerramienta(r.herramienta)} · ${r.codigoPais} · ${palabras.filas.length} palabras clave` },
          datos: { herramienta: r.herramienta, codigoPais: r.codigoPais, palabras },
        };
      }
      return guardado(r.herramienta, r.codigoPais, `${nombreHerramienta(r.herramienta)}${r.codigoPais ? ` · ${r.codigoPais}` : ""} · ${filas.length - 1} filas`);
    }
    const tipo = archivo.type;
    const esPdf = tipo === "application/pdf" || /\.pdf$/i.test(archivo.name);
    if (esImagen(tipo) || esPdf) {
      // Amazon's revenue calculator: straight to its own reader when the owner says so, else after the general one.
      const calculadora = async () => {
        if (!esImagen(tipo)) return guardado("calculadora", pista.codigoPais, "Calculadora Amazon (PDF: súbela como captura para leerla)");
        const k = await leerCalculadora(datos, tipo, archivo.name, pista);
        if (!k.codigoPais) return sinPais("calculadora");
        const leida: CalculadoraAmazon = { ...k, codigoPais: k.codigoPais, fecha };
        return {
          meta: { herramienta: "calculadora" as const, codigoPais: k.codigoPais, estado: "procesado" as const, resumen: `Calculadora Amazon · ${k.codigoPais} · ${k.asin || k.producto.slice(0, 40)} · ${k.precio} ${k.moneda === "GBP" ? "£" : "€"}` },
          datos: { herramienta: "calculadora" as const, codigoPais: k.codigoPais, calculadora: leida },
        };
      };
      // Helium 10's «Search Volume» chart: the searches month by month.
      const busquedas = async () => {
        if (!esImagen(tipo)) return guardado("busquedas", pista.codigoPais, "Historial de búsquedas (PDF: súbelo como captura para leerlo)");
        const b = await leerBusquedas(datos, tipo, archivo.name, pista, fecha);
        if (!b.codigoPais) return sinPais("busquedas");
        if (b.meses.length < 3) throw new Error("No se ven bien los meses del gráfico: súbelo más grande, con el eje de fechas a la vista");
        const historial: HistorialBusquedas = { ...b, codigoPais: b.codigoPais, fecha };
        const { mes: desde } = b.meses[0];
        const { mes: hasta } = b.meses.at(-1)!;
        return {
          meta: { herramienta: "busquedas" as const, codigoPais: b.codigoPais, estado: "procesado" as const, resumen: `Historial de búsquedas · ${b.codigoPais}${b.palabraClave ? ` · ${b.palabraClave}` : ""} · ${b.meses.length} meses (${desde} a ${hasta})` },
          datos: { herramienta: "busquedas" as const, codigoPais: b.codigoPais, historial },
        };
      };
      if (pista.herramienta === "calculadora") return await calculadora();
      if (pista.herramienta === "busquedas") return await busquedas();
      const c = await leerCaptura(datos, esPdf ? "application/pdf" : (tipo as Parameters<typeof leerCaptura>[1]), archivo.name, pista);
      if (c.herramienta === "calculadora") return await calculadora();
      if (c.herramienta === "busquedas") return await busquedas();
      if (c.herramienta === "xray" && c.competidores.length) {
        if (!c.codigoPais) return sinPais("xray");
        const mercado = mercadoDesdeCaptura(c, c.codigoPais, fecha);
        return {
          meta: { herramienta: "xray", codigoPais: c.codigoPais, estado: "procesado", palabraClave: mercado.palabraClave, resumen: `Xray (captura) · ${c.codigoPais} · ${mercado.palabraClave} · ${mercado.competidores.length} productos visibles` },
          datos: { herramienta: "xray", codigoPais: c.codigoPais, mercado },
        };
      }
      if ((c.herramienta === "cerebro" || c.herramienta === "magnet") && c.palabras.length) {
        if (!c.codigoPais) return sinPais(c.herramienta);
        const filas: FilaPalabra[] = c.palabras.map((p) => ({
          texto: p.texto.toLowerCase(),
          busquedas: p.busquedas,
          tendencia: p.tendencia ?? 0,
          competidores: p.competidores ?? 0,
          cpr: p.cpr ?? 0,
          densidadTitulos: p.densidadTitulos ?? 0,
          pujaPpc: p.pujaPpc ?? 0,
          posiciones: {},
        }));
        return {
          meta: { herramienta: c.herramienta, codigoPais: c.codigoPais, estado: "procesado", resumen: `${nombreHerramienta(c.herramienta)} (captura) · ${c.codigoPais} · ${filas.length} palabras clave visibles` },
          datos: { herramienta: c.herramienta, codigoPais: c.codigoPais, palabras: { columnasPosicion: [], filas } },
        };
      }
      return guardado(c.herramienta, c.codigoPais, `${nombreHerramienta(c.herramienta)}${c.codigoPais ? ` · ${c.codigoPais}` : ""} · ${c.descripcion}`);
    }
    // PDFs, spreadsheets… kept as they are.
    const h = pista.herramienta ?? "otro";
    return guardado(h, pista.codigoPais, `${nombreHerramienta(h)}${/\.xlsx?$/i.test(archivo.name) ? " · Excel (para leerlo, expórtalo en CSV)" : ""}`);
  } catch (e) {
    console.error("[estudiosH10] procesar", e);
    return {
      meta: { herramienta: pista.herramienta ?? "otro", codigoPais: pista.codigoPais, estado: "error", resumen: archivo.name, error: mensajeError(e) },
      datos: null,
    };
  }
}

/** Stores a file of the study, reads it and adds its data. */
export async function subirArchivo(id: string, archivo: File, pista: Pista): Promise<ArchivoH10> {
  const e = await entrada(id);
  if (archivo.size === 0) throw new Error("El archivo está vacío");
  if (archivo.size > TAMANO_MAXIMO_H10) throw new Error("El archivo pasa de 15 MB");
  const datos = Buffer.from(await archivo.arrayBuffer());
  const base = { id: randomUUID(), nombre: nombreArchivo(archivo.name), tipo: archivo.type || "application/octet-stream", tamano: archivo.size, subidoEn: new Date().toISOString() };
  await bucket()
    .file(ruta(id, base))
    .save(datos, { contentType: base.tipo, resumable: false });
  const r = await procesar(archivo, datos, pista, diaMadrid(new Date()));
  const nuevo: ArchivoH10 = { ...base, ...r.meta };
  if (!nuevo.error) delete nuevo.error;
  if (r.datos) {
    await col().doc(id).collection("datos").doc(nuevo.id).set(JSON.parse(JSON.stringify(r.datos)));
    contarEscrituras(1);
    e.datos.set(nuevo.id, r.datos);
  }
  e.estudio = { ...e.estudio, archivos: [nuevo, ...e.estudio.archivos], actualizadoEn: nuevo.subidoEn };
  await guardarEstudio(e.estudio);
  return nuevo;
}

/**
 * Reads a stored file again (as it was uploaded: same country and kind), replacing what was read from it. Useful
 * when the reading improves, e.g. for CSVs read before the app took the «ASIN Revenue» column.
 */
export async function releerArchivo(id: string, archivoId: string): Promise<ArchivoH10> {
  const e = await entrada(id);
  const a = e.estudio.archivos.find((x) => x.id === archivoId);
  if (!a) throw new Error("Archivo no encontrado");
  const [datos] = await bucket().file(ruta(id, a)).download();
  const archivo = new File([new Uint8Array(datos)], a.nombre, { type: a.tipo });
  const r = await procesar(archivo, datos, { codigoPais: a.codigoPais, herramienta: a.herramienta === "otro" ? null : a.herramienta }, a.subidoEn.slice(0, 10));
  const nuevo: ArchivoH10 = { ...a, ...r.meta };
  if (!r.meta.error) delete nuevo.error;
  if (r.datos) {
    await col().doc(id).collection("datos").doc(a.id).set(JSON.parse(JSON.stringify(r.datos)));
    contarEscrituras(1);
    e.datos.set(a.id, r.datos);
  }
  e.estudio = { ...e.estudio, archivos: e.estudio.archivos.map((x) => (x.id === a.id ? nuevo : x)), actualizadoEn: new Date().toISOString() };
  await guardarEstudio(e.estudio);
  return nuevo;
}

/** Deletes a file and the data read from it. */
export async function borrarArchivo(id: string, archivoId: string): Promise<void> {
  const e = await entrada(id);
  const a = e.estudio.archivos.find((x) => x.id === archivoId);
  if (!a) return;
  await bucket().file(ruta(id, a)).delete({ ignoreNotFound: true });
  if (e.datos.has(archivoId)) {
    await col().doc(id).collection("datos").doc(archivoId).delete();
    e.datos.delete(archivoId);
  }
  e.estudio = { ...e.estudio, archivos: e.estudio.archivos.filter((x) => x.id !== archivoId), actualizadoEn: new Date().toISOString() };
  await guardarEstudio(e.estudio);
  contarEscrituras(1);
}

/** A link to the original file valid for 5 minutes. */
export async function enlaceArchivo(id: string, archivoId: string, descargar: boolean): Promise<string> {
  const e = await entrada(id);
  const a = e.estudio.archivos.find((x) => x.id === archivoId);
  if (!a) throw new Error("Archivo no encontrado");
  const [url] = await bucket()
    .file(ruta(id, a))
    .getSignedUrl({ action: "read", expires: Date.now() + 5 * 60_000, responseDisposition: `${descargar ? "attachment" : "inline"}; filename="${a.nombre}"`, responseType: a.tipo });
  return url;
}

// ---------- The study as the page shows it ----------

/** `costesPropios`: the owner already saved their own costs (factory price, freight) in «Rentabilidad». */
/** `paresAmazon`: the competitor ASINs × countries «Traer datos de Amazon» fetches. */
export type EstudioParaVista = {
  estudio: EstudioH10;
  palabras: Record<string, PalabrasMercado>;
  archivos: ArchivoH10[];
  creadoEn: string;
  costesPropios: boolean;
  paresAmazon: { asin: string; codigoPais: CodigoPais }[];
};

/** Per country: the latest Xray, and the keywords of every Cerebro and Magnet merged (a keyword once, with its best data). */
function ensamblar({ estudio, datos, amazon }: Entrada): EstudioParaVista {
  const subido = new Map(estudio.archivos.map((a) => [a.id, a.subidoEn]));
  const lista = [...datos.entries()].sort((a, b) => (subido.get(b[0]) ?? "").localeCompare(subido.get(a[0]) ?? ""));

  const calculadoras: Partial<Record<CodigoPais, CalculadoraAmazon>> = {};
  for (const [, d] of lista) if (d.calculadora && d.codigoPais && !calculadoras[d.codigoPais]) calculadoras[d.codigoPais] = d.calculadora;

  const busquedas: Partial<Record<CodigoPais, HistorialBusquedas>> = {};
  for (const [, d] of lista) if (d.historial && d.codigoPais && !busquedas[d.codigoPais]) busquedas[d.codigoPais] = d.historial;

  const mercados = new Map<CodigoPais, MercadoXray>();
  const xraysAnteriores: Partial<Record<CodigoPais, MercadoXray[]>> = {};
  for (const [, d] of lista) {
    if (!d.mercado || !d.codigoPais) continue;
    if (!mercados.has(d.codigoPais)) mercados.set(d.codigoPais, structuredClone(d.mercado));
    // Older Xrays of the same country: only their totals, for revenue per search.
    else (xraysAnteriores[d.codigoPais] ??= []).push({ ...d.mercado, competidores: [] });
  }

  const palabras: Record<string, PalabrasMercado> = {};
  const paises = new Set(lista.filter(([, d]) => d.palabras && d.codigoPais).map(([, d]) => d.codigoPais!));
  for (const pais of paises) {
    const filas = new Map<string, FilaPalabra>();
    const columnas = new Set<string>();
    // Oldest first, so newer files overwrite; Cerebro after Magnet, so its ranks win.
    const fuentes = lista.filter(([, d]) => d.codigoPais === pais && d.palabras).reverse().sort((a, b) => (a[1].herramienta === "cerebro" ? 1 : 0) - (b[1].herramienta === "cerebro" ? 1 : 0));
    for (const [, d] of fuentes) {
      d.palabras!.columnasPosicion.forEach((c) => columnas.add(c));
      for (const f of d.palabras!.filas) {
        const previa = filas.get(f.texto);
        filas.set(f.texto, previa ? { ...previa, ...f, busquedas: Math.max(previa.busquedas, f.busquedas), posiciones: { ...previa.posiciones, ...f.posiciones } } : f);
      }
    }
    // Competitor columns: an ASIN header is named after its brand when the Xray of that country has it.
    const mercado = mercados.get(pais);
    const marcaDe = (columna: string) => mercado?.competidores.find((c) => c.asin && columna.toUpperCase().includes(c.asin.toUpperCase()))?.marca ?? columna;
    const todas = [...filas.values()];
    const rivales = [...columnas]
      .map((c) => ({ c, top10: todas.filter((f) => (f.posiciones[c] ?? 999) <= 10).length }))
      .sort((a, b) => b.top10 - a.top10)
      .slice(0, MAX_RIVALES)
      .map((x) => x.c);
    palabras[pais] = {
      rivales: rivales.map(marcaDe),
      palabras: todas
        .sort((a, b) => b.busquedas - a.busquedas)
        .slice(0, PALABRAS_EN_PAGINA)
        .map(
          (f): PalabraClave => ({
            texto: f.texto,
            busquedas: f.busquedas,
            tendencia: f.tendencia,
            competidores: f.competidores,
            cpr: f.cpr,
            densidadTitulos: f.densidadTitulos,
            pujaPpc: f.pujaPpc,
            posiciones: rivales.map((c) => f.posiciones[c] ?? null),
          }),
        ),
    };
    // An Xray without its keyword's searches (CSV) takes them from the keywords.
    // Compared without accents, umlauts or «ß»: a keyword taken from a file name is often written «fur fussball».
    if (mercado && mercado.busquedas === null) {
      const clave = sinAcentos(mercado.palabraClave);
      mercado.busquedas = todas.find((f) => sinAcentos(f.texto) === clave)?.busquedas ?? null;
    }
  }

  return {
    estudio: {
      id: estudio.id,
      nombre: estudio.nombre,
      descripcion: estudio.descripcion,
      mercados: [...mercados.values()],
      calculadoras,
      busquedas,
      xraysAnteriores,
      supuestos: estudio.supuestos ?? SUPUESTOS_INICIALES,
      // The page only needs the last months of the follow-up.
      amazon: [...amazon.values()].map((v) => ({ ficha: v.ficha, puntos: v.puntos.slice(-PUNTOS_EN_PAGINA) })),
      asinsManuales: estudio.asinsManuales ?? [],
    },
    paresAmazon: paresAmazon([...mercados.values()], estudio.asinsManuales ?? []),
    palabras,
    archivos: estudio.archivos,
    costesPropios: !!estudio.supuestos,
    creadoEn: estudio.creadoEn,
  };
}

/** Every stored study, newest first, ready for the page. */
export async function estudiosParaVista(): Promise<EstudioParaVista[]> {
  return [...(await cargar()).values()].map(ensamblar).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

// ---------- Competitors read straight from Amazon ----------

/** Competitors per country taken from its Xray (by revenue), and days of follow-up kept / sent to the page. */
const COMPETIDORES_POR_PAIS = 5;
const PUNTOS_GUARDADOS = 730;
const PUNTOS_EN_PAGINA = 120;
const idAmazon = (pais: string, asin: string) => `${pais}_${asin}`;
const mkDe = (pais: CodigoPais) => Object.entries(MARKETPLACES).find(([, c]) => c === pais)![0];
const MARKETPLACES: Record<string, CodigoPais> = { A1RKKUPIHCS9HS: "ES", A1PA6795UKMFR9: "DE", A13V1IB3VIYZZH: "FR", APJ6JRA9NG5V4: "IT", A1F83G8C2ARO7P: "GB" };
const esAsin = (v: unknown): v is string => typeof v === "string" && /^[A-Z0-9]{10}$/.test(v);

/** What the button fetches: each country's top Xray competitors with an ASIN (CSV exports carry it), plus the hand-added ASINs in every country. */
function paresAmazon(mercados: MercadoXray[], manuales: string[]): { asin: string; codigoPais: CodigoPais }[] {
  const pares = new Map<string, { asin: string; codigoPais: CodigoPais }>();
  for (const m of mercados)
    for (const c of [...m.competidores].filter((x) => esAsin(x.asin)).sort((a, b) => b.facturacion - a.facturacion).slice(0, COMPETIDORES_POR_PAIS))
      pares.set(`${m.codigoPais}|${c.asin}`, { asin: c.asin!, codigoPais: m.codigoPais });
  for (const asin of manuales) for (const p of PAISES_H10) pares.set(`${p}|${asin}`, { asin, codigoPais: p });
  return [...pares.values()];
}

/** Today's point of the follow-up, replacing an earlier one of the same day. */
function conPunto(puntos: PuntoSeguimiento[], punto: PuntoSeguimiento): PuntoSeguimiento[] {
  return [...puntos.filter((x) => x.dia !== punto.dia), punto].sort((a, b) => a.dia.localeCompare(b.dia)).slice(-PUNTOS_GUARDADOS);
}

async function guardarAmazon(e: Entrada, v: SeguimientoAmazon) {
  await col().doc(e.estudio.id).collection("amazon").doc(idAmazon(v.ficha.codigoPais, v.ficha.asin)).set(JSON.parse(JSON.stringify(v)));
  contarEscrituras(1);
  e.amazon.set(`${v.ficha.codigoPais}|${v.ficha.asin}`, v);
}

/**
 * A price to ask the fees at when the ASIN has no offer in that country, in its currency: its Xray price there, its
 * price in another country, yours, or the middle price of that country's Xray. The commission is a share of the
 * price and the FBA fee hardly depends on it, so an approximate one is enough.
 */
function precioParaTarifas(e: Entrada, pais: CodigoPais, asin: string, moneda: "EUR" | "GBP"): number | null {
  const enMoneda = (v: number, de: string) => Math.round((de === moneda ? v : de === "GBP" ? v * EUR_POR_GBP : v / EUR_POR_GBP) * 100) / 100;
  const m = [...e.datos.values()].find((d) => d.codigoPais === pais && d.mercado)?.mercado;
  const xray = m?.competidores.find((c) => c.asin === asin)?.precio;
  if (xray) return xray;
  const fuera = [...e.amazon.values()].find((v) => v.ficha.asin === asin && v.ficha.precio)?.ficha;
  if (fuera?.precio) return enMoneda(fuera.precio, fuera.moneda);
  const tuyo = e.estudio.supuestos?.precios?.[pais];
  if (tuyo) return enMoneda(tuyo, "EUR");
  const precios = (m?.competidores ?? []).map((c) => c.precio).filter((p) => p > 0).sort((a, b) => a - b);
  return precios.length ? precios[Math.floor(precios.length / 2)] : null;
}

/**
 * Reads one competitor ASIN in one country from Amazon: catalog (name, package, ranks), offers (price, sellers,
 * featured offer) and the fee estimate at its price. A missing ASIN is kept with its error so the table says so.
 */
export async function traerCompetidorAmazon(id: string, asin: unknown, pais: unknown): Promise<FichaAmazon> {
  if (!esAsin(asin)) throw new Error("ASIN no válido");
  if (!esCodigoPais(pais)) throw new Error("País no válido");
  const e = await entrada(id);
  const mk = mkDe(pais);
  const moneda = marketplaceConocido(mk)?.moneda === "GBP" ? "GBP" : "EUR";
  const ahora = new Date().toISOString();
  const previo = e.amazon.get(`${pais}|${asin}`);
  const base: FichaAmazon = { asin, codigoPais: pais, moneda, titulo: null, marca: null, paquete: null, rankings: [], precio: null, ofertas: null, destacadaFba: null, comision: null, tarifaFba: null, precioTarifas: null, tarifasEn: null, actualizadoEn: ahora };

  const catalogo = (await fichasCompetidores([asin], mk)).get(asin);
  if (!catalogo) {
    const ficha: FichaAmazon = { ...base, error: `No se vende en ${nombrePais(pais)}` };
    await guardarAmazon(e, { ficha, puntos: previo?.puntos ?? [] });
    return ficha;
  }
  const errores: string[] = [];
  const ofertas = await ofertasCompetidor(asin, mk).catch((x) => (errores.push(`Amazon no dio el precio ni los vendedores (${mensajeError(x)})`), null));
  // Fees at its current price; without offers there, at an approximate one.
  const precioTarifas = ofertas?.precio ?? precioParaTarifas(e, pais, asin, moneda);
  let fallo = "";
  const tarifas = precioTarifas ? await tarifasCompetidor(asin, mk, precioTarifas, moneda).catch((x) => ((fallo = mensajeError(x)), null)) : null;
  // Amazon's fee service fails now and then: the fees it gave before stay, and the daily follow-up asks again.
  const antes = previo?.ficha.tarifaFba != null ? previo.ficha : null;
  if (fallo && !antes)
    errores.push(/InternalError/.test(fallo) ? "Amazon no dio las tarifas ahora (su servicio falla a ratos): vuelve a pulsar el botón o espera a mañana, la app lo reintenta sola" : `Amazon no dio las tarifas: ${fallo}`);
  const ficha: FichaAmazon = {
    ...base,
    ...catalogo,
    precio: ofertas?.precio ?? null,
    ofertas: ofertas?.ofertas ?? null,
    destacadaFba: ofertas?.destacadaFba ?? null,
    comision: tarifas?.comision ?? antes?.comision ?? null,
    tarifaFba: tarifas?.tarifaFba ?? antes?.tarifaFba ?? null,
    precioTarifas: tarifas ? precioTarifas : (antes?.precioTarifas ?? null),
    tarifasEn: tarifas ? ahora : (antes?.tarifasEn ?? null),
    ...(errores.length && { error: errores.join(" · ") }),
  };
  const punto: PuntoSeguimiento = { dia: diaMadrid(new Date()), precio: ficha.precio, ofertas: ficha.ofertas, rank: ficha.rankings[0]?.rank ?? null };
  await guardarAmazon(e, { ficha, puntos: conPunto(previo?.puntos ?? [], punto) });
  return ficha;
}

/** Adds or removes an ASIN of the follow-up by hand (removing it also drops its stored data). */
export async function asinManual(id: string, asin: unknown, accion: "agregar" | "quitar"): Promise<void> {
  const limpio = typeof asin === "string" ? asin.trim().toUpperCase() : "";
  if (!esAsin(limpio)) throw new Error("Un ASIN tiene 10 letras o números (por ejemplo B0DS9VCV6L)");
  const e = await entrada(id);
  const actuales = e.estudio.asinsManuales ?? [];
  if (accion === "agregar") {
    if (actuales.includes(limpio)) return;
    e.estudio = { ...e.estudio, asinsManuales: [...actuales, limpio] };
  } else {
    e.estudio = { ...e.estudio, asinsManuales: actuales.filter((a) => a !== limpio) };
    // Its data goes too, unless an Xray still lists it.
    const siguen = new Set(paresAmazon(ensamblar(e).estudio.mercados, e.estudio.asinsManuales ?? []).map((x) => `${x.codigoPais}|${x.asin}`));
    for (const [clave, v] of [...e.amazon]) {
      if (v.ficha.asin !== limpio || siguen.has(clave)) continue;
      await col().doc(id).collection("amazon").doc(idAmazon(v.ficha.codigoPais, v.ficha.asin)).delete();
      contarEscrituras(1);
      e.amazon.delete(clave);
    }
  }
  await guardarEstudio(e.estudio);
}

// ---------- Daily follow-up ----------

const gs = globalThis as unknown as { __seguimientoH10?: { dia: string | null; enCurso: boolean } };
const refSeguimiento = () => adminDb().collection("config").doc("seguimientoH10");
/** Fees are asked again when older than this. */
const TARIFAS_VALIDAS_MS = 7 * 24 * 3600_000;

/**
 * Once a day (called from the hourly sync, runs in the background): price, sellers and sales rank of every
 * competitor already fetched, two calls per country and study (20 ASINs each); the fees again once a week.
 */
export function lanzarSeguimientoH10(): void {
  const estado = (gs.__seguimientoH10 ??= { dia: null, enCurso: false });
  const hoy = diaMadrid(new Date());
  if (estado.enCurso || estado.dia === hoy) return;
  estado.enCurso = true;
  void (async () => {
    try {
      if (estado.dia === null) {
        estado.dia = ((await refSeguimiento().get()).get("dia") as string | undefined) ?? "";
        contarLecturas(1);
        if (estado.dia === hoy) return;
      }
      for (const e of (await cargar()).values()) {
        const porPais = new Map<CodigoPais, SeguimientoAmazon[]>();
        for (const v of e.amazon.values()) if (!v.ficha.error?.startsWith("No se vende") && v.puntos.at(-1)?.dia !== hoy) porPais.set(v.ficha.codigoPais, [...(porPais.get(v.ficha.codigoPais) ?? []), v]);
        for (const [pais, lista] of porPais) {
          const mk = mkDe(pais);
          for (let i = 0; i < lista.length; i += 20) {
            const tanda = lista.slice(i, i + 20);
            const asins = tanda.map((v) => v.ficha.asin);
            const [fichas, precios] = await Promise.all([fichasCompetidores(asins, mk).catch(() => new Map()), preciosCompetidores(asins, mk).catch(() => new Map())]);
            for (const v of tanda) {
              const f = fichas.get(v.ficha.asin);
              const pr = precios.get(v.ficha.asin);
              // Amazon gave nothing of it today: no point (yesterday's figures aren't today's), tomorrow it asks again.
              if (!f && !pr) continue;
              const ficha: FichaAmazon = { ...v.ficha, ...(f && { rankings: f.rankings }), ...(pr && { precio: pr.precio, ofertas: pr.ofertas }), actualizadoEn: new Date().toISOString() };
              // Without offers, at the price they were asked at last time.
              const precioTarifas = ficha.precio ?? ficha.precioTarifas;
              if (precioTarifas && (!ficha.tarifasEn || Date.now() - new Date(ficha.tarifasEn).getTime() > TARIFAS_VALIDAS_MS)) {
                const t = await tarifasCompetidor(ficha.asin, mk, precioTarifas, ficha.moneda).catch(() => null);
                if (t) Object.assign(ficha, { comision: t.comision, tarifaFba: t.tarifaFba, precioTarifas, tarifasEn: new Date().toISOString() });
              }
              // A day that read it all clears the warning of an earlier failed read.
              if (pr && ficha.tarifaFba !== null) delete ficha.error;
              const punto: PuntoSeguimiento = { dia: hoy, precio: pr ? ficha.precio : null, ofertas: pr ? ficha.ofertas : null, rank: f ? (ficha.rankings[0]?.rank ?? null) : null };
              await guardarAmazon(e, { ficha, puntos: conPunto(v.puntos, punto) });
            }
          }
        }
      }
      estado.dia = hoy;
      await refSeguimiento().set({ dia: hoy, hecho: new Date().toISOString() });
      contarEscrituras(1);
    } catch (e) {
      console.error("[seguimientoH10]", e);
    } finally {
      estado.enCurso = false;
    }
  })();
}
