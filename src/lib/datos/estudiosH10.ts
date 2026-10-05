import "server-only";

import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { bucket } from "./documentos";
import { contarEscrituras, contarLecturas } from "./consumo";
import { diaMadrid } from "./fechas";
import { leerCsv, mercadoDesdeCsv, palabrasDesdeCsv, type FilaPalabra } from "./h10Csv";
import { esImagen, leerCalculadora, leerCaptura, reconocerCsv, type CapturaLeida, type Pista } from "@/lib/ia/leerH10";
import { mensajeError } from "@/lib/ia/errores";
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
  type MercadoXray,
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
};
type DatosArchivo = {
  herramienta: HerramientaH10;
  codigoPais: CodigoPais | null;
  mercado?: MercadoXray;
  palabras?: { columnasPosicion: string[]; filas: FilaPalabra[] };
  calculadora?: CalculadoraAmazon;
};
type Entrada = { estudio: EstudioGuardado; datos: Map<string, DatosArchivo> };

export const TAMANO_MAXIMO_H10 = 15 * 1024 * 1024;
/** Keywords per country sent to the page (the rest stay stored). */
const PALABRAS_EN_PAGINA = 400;
/** Competitor columns in the keyword table. */
const MAX_RIVALES = 5;

const g = globalThis as unknown as { __estudiosH10?: Map<string, Entrada> };
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
  if (g.__estudiosH10) return g.__estudiosH10;
  const snap = await col().get();
  contarLecturas(Math.max(snap.size, 1));
  const mapa = new Map<string, Entrada>();
  for (const d of snap.docs) {
    const datos = await d.ref.collection("datos").get();
    contarLecturas(Math.max(datos.size, 1));
    mapa.set(d.id, { estudio: { id: d.id, ...(d.data() as Omit<EstudioGuardado, "id">) }, datos: new Map(datos.docs.map((x) => [x.id, x.data() as DatosArchivo])) });
  }
  g.__estudiosH10 = mapa;
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
  (await cargar()).set(estudio.id, { estudio, datos: new Map() });
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
  await col().doc(id).delete();
  contarEscrituras(e.datos.size + 1);
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
      const r = await reconocerCsv(archivo.name, filas, pista);
      if (r.herramienta === "xray") {
        if (!r.codigoPais) return sinPais("xray");
        const mercado = mercadoDesdeCsv(filas, r.xray, { codigoPais: r.codigoPais, moneda: r.moneda, palabraClave: r.palabraClave || "—", fecha });
        return {
          meta: { herramienta: "xray", codigoPais: r.codigoPais, estado: "procesado", resumen: `Xray · ${r.codigoPais} · ${mercado.palabraClave} · ${mercado.asins} productos` },
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
    if (esImagen(tipo)) {
      // Amazon's revenue calculator: straight to its own reader when the owner says so, else after the general one.
      const calculadora = async () => {
        const k = await leerCalculadora(datos, tipo, archivo.name, pista);
        if (!k.codigoPais) return sinPais("calculadora");
        const leida: CalculadoraAmazon = { ...k, codigoPais: k.codigoPais, fecha };
        return {
          meta: { herramienta: "calculadora" as const, codigoPais: k.codigoPais, estado: "procesado" as const, resumen: `Calculadora Amazon · ${k.codigoPais} · ${k.asin || k.producto.slice(0, 40)} · ${k.precio} ${k.moneda === "GBP" ? "£" : "€"}` },
          datos: { herramienta: "calculadora" as const, codigoPais: k.codigoPais, calculadora: leida },
        };
      };
      if (pista.herramienta === "calculadora") return await calculadora();
      const c = await leerCaptura(datos, tipo, archivo.name, pista);
      if (c.herramienta === "calculadora") return await calculadora();
      if (c.herramienta === "xray" && c.competidores.length) {
        if (!c.codigoPais) return sinPais("xray");
        const mercado = mercadoDesdeCaptura(c, c.codigoPais, fecha);
        return {
          meta: { herramienta: "xray", codigoPais: c.codigoPais, estado: "procesado", resumen: `Xray (captura) · ${c.codigoPais} · ${mercado.palabraClave} · ${mercado.competidores.length} productos visibles` },
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

export type EstudioParaVista = { estudio: EstudioH10; palabras: Record<string, PalabrasMercado>; archivos: ArchivoH10[]; creadoEn: string };

/** Per country: the latest Xray, and the keywords of every Cerebro and Magnet merged (a keyword once, with its best data). */
function ensamblar({ estudio, datos }: Entrada): EstudioParaVista {
  const subido = new Map(estudio.archivos.map((a) => [a.id, a.subidoEn]));
  const lista = [...datos.entries()].sort((a, b) => (subido.get(b[0]) ?? "").localeCompare(subido.get(a[0]) ?? ""));

  const calculadoras: Partial<Record<CodigoPais, CalculadoraAmazon>> = {};
  for (const [, d] of lista) if (d.calculadora && d.codigoPais && !calculadoras[d.codigoPais]) calculadoras[d.codigoPais] = d.calculadora;

  const mercados = new Map<CodigoPais, MercadoXray>();
  for (const [, d] of lista) if (d.mercado && d.codigoPais && !mercados.has(d.codigoPais)) mercados.set(d.codigoPais, structuredClone(d.mercado));

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
    estudio: { id: estudio.id, nombre: estudio.nombre, descripcion: estudio.descripcion, mercados: [...mercados.values()], calculadoras, supuestos: estudio.supuestos ?? SUPUESTOS_INICIALES },
    palabras,
    archivos: estudio.archivos,
    creadoEn: estudio.creadoEn,
  };
}

/** Every stored study, newest first, ready for the page. */
export async function estudiosParaVista(): Promise<EstudioParaVista[]> {
  return [...(await cargar()).values()].map(ensamblar).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}
