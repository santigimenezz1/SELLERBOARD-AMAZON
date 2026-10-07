import { strFromU8, unzipSync } from "fflate";
import type { ResenasH10, TemaH10 } from "./h10Tipos";

/*
 * Reading Helium 10's Excel exports without a spreadsheet library: an .xlsx is a ZIP of XML files (the workbook, one
 * file per sheet and a table of shared strings).
 */

const desescapar = (t: string) =>
  t
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

/** Every sheet of a workbook by name, as rows of cell texts. */
export function hojasExcel(datos: Uint8Array): Map<string, string[][]> {
  const zip = unzipSync(datos);
  const texto = (ruta: string) => (zip[ruta] ? strFromU8(zip[ruta]) : "");
  const compartidas = [...texto("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => desescapar([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const rutas = new Map([...texto("xl/_rels/workbook.xml.rels").matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2].replace(/^\/?(xl\/)?/, "xl/")]));
  const hojas = new Map<string, string[][]>();
  for (const [, nombre, id] of texto("xl/workbook.xml").matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const xml = texto(rutas.get(id) ?? "");
    const filas = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((f) =>
      [...f[1].matchAll(/<c [^>]*?r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].reduce<string[]>((fila, [, col, attrs, dentro]) => {
        const v = dentro?.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? dentro?.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
        const i = [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        fila[i] = /t="s"/.test(attrs) ? (compartidas[Number(v)] ?? "") : desescapar(v);
        return fila;
      }, []),
    );
    hojas.set(desescapar(nombre), filas.map((f) => Array.from(f, (c) => c ?? "")));
  }
  return hojas;
}

/** Topics of a «… Topic Insights» sheet: topic, the product's mentions and %, the category's % and snippets. */
function temas(filas: string[][] | undefined): TemaH10[] {
  if (!filas?.length) return [];
  const [cab, ...datos] = filas;
  const col = (re: RegExp) => cab.findIndex((c) => re.test(c));
  const iTema = col(/^topic$/i);
  const iMenciones = col(/^asin #mentions/i);
  const iPorcentaje = col(/^asin %mentions/i);
  const iCategoria = col(/^category %mentions/i);
  const iEjemplos = col(/snippet/i);
  return datos
    .filter((f) => f[iTema]?.trim())
    .map((f) => ({
      tema: f[iTema].trim(),
      menciones: Number(f[iMenciones]) || 0,
      porcentaje: Number(f[iPorcentaje]) || 0,
      categoria: iCategoria >= 0 && f[iCategoria] !== "" && Number.isFinite(Number(f[iCategoria])) ? Number(f[iCategoria]) : null,
      ejemplos: (f[iEjemplos] ?? "")
        .split(/;\s*/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 4)
        .map((x) => x.slice(0, 300)),
    }));
}

/**
 * Helium 10's «Review Analysis» Excel of one product: praised and criticised topics and their effect on the rating.
 * Null when the workbook isn't that export.
 */
export function resenasDesdeExcel(datos: Uint8Array, nombreArchivo: string): ResenasH10 | null {
  const hojas = hojasExcel(datos);
  const hoja = (re: RegExp) => [...hojas].find(([n]) => re.test(n))?.[1];
  const positivas = hoja(/positive topic insights/i);
  const negativas = hoja(/negative topic insights/i);
  if (!positivas && !negativas) return null;
  const impacto = [...(hoja(/positive star rating impact/i)?.slice(1) ?? []), ...(hoja(/negative star rating impact/i)?.slice(1) ?? [])]
    .filter((f) => f[0]?.trim() && Number.isFinite(Number(f[1])))
    .map((f) => ({ tema: f[0].trim(), valor: Number(f[1]) }));
  return { asin: nombreArchivo.match(/B0[A-Z0-9]{8}/)?.[0] ?? null, positivos: temas(positivas), negativos: temas(negativas), impacto };
}
