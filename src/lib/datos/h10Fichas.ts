import { esCodigoPais, type ListingAmazon } from "./h10Tipos";

/*
 * Competitors' listings from a «ficha» JSON file: one listing or a list of them, as read from each Amazon page (title,
 * bullets, description, A+ and the photos' links). Read straight from the file, no AI. Photos only from Amazon's own
 * image server, so the file can't make the page load anything else.
 */

const FOTO_AMAZON = /^https:\/\/m\.media-amazon\.com\/images\/[\w\-.,+%/]+$/;
const ASIN = /^[A-Z0-9]{10}$/;

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const textoONulo = (v: unknown, max: number) => texto(v, max) || null;
const lista = (v: unknown, max: number, largo: number) => (Array.isArray(v) ? v.map((x) => texto(x, largo)).filter(Boolean).slice(0, max) : []);
const fotos = (v: unknown, max: number) => [...new Set(lista(v, max, 400).filter((u) => FOTO_AMAZON.test(u)))];

function listing(v: unknown, leidoEn: string): ListingAmazon | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const asin = texto(o.asin, 10).toUpperCase();
  const pais = texto(o.codigoPais ?? o.pais, 2).toUpperCase();
  const titulo = texto(o.titulo, 400);
  if (!ASIN.test(asin) || !esCodigoPais(pais) || !titulo) return null;
  const parent = texto(o.parent, 10).toUpperCase();
  return {
    asin,
    codigoPais: pais,
    parent: ASIN.test(parent) ? parent : null,
    familia: lista(o.familia, 30, 10).map((x) => x.toUpperCase()).filter((x) => ASIN.test(x)),
    url: texto(o.url, 200),
    titulo,
    marca: texto(o.marca, 120),
    precio: textoONulo(o.precio, 40),
    precioXray: textoONulo(o.precioXray, 40),
    valoracion: textoONulo(o.valoracion, 40),
    resenas: textoONulo(o.resenas, 20),
    vinetas: lista(o.vinetas, 10, 1500),
    caracteristicas: lista(o.caracteristicas, 20, 300),
    detalles: lista(o.detalles, 30, 300),
    descripcion: textoONulo(o.descripcion, 4000),
    video: o.video === true,
    fotos: fotos(o.fotos, 12),
    aplusTexto: textoONulo(o.aplusTexto, 4000),
    aplusFotos: fotos(o.aplusFotos, 20),
    historiaMarca: textoONulo(o.historiaMarca, 1500),
    leidoEn: texto(o.leidoEn ?? o.fecha, 40) || leidoEn,
  };
}

/** The listings of a «ficha» JSON file (one object, a list, or `{ listings: [...] }`), or null when it isn't one. */
export function listingsDesdeJson(contenido: string, leidoEn: string): ListingAmazon[] | null {
  let datos: unknown;
  try {
    datos = JSON.parse(contenido);
  } catch {
    return null;
  }
  const crudos = Array.isArray(datos) ? datos : datos && typeof datos === "object" && Array.isArray((datos as { listings?: unknown }).listings) ? (datos as { listings: unknown[] }).listings : [datos];
  const leidos = crudos.slice(0, 200).map((x) => listing(x, leidoEn)).filter((x): x is ListingAmazon => !!x);
  return leidos.length ? leidos : null;
}
