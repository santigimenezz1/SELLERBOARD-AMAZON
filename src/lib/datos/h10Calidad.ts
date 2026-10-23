import type { EstudioH10, PalabrasMercado } from "./h10Tipos";
import { analizarMercado, nombrePais } from "./h10Analisis";

/*
 * The data check before a report: what in the study looks wrong or is missing, so the report isn't paid for on bad
 * data. «grave»: the report would rest on something broken (an empty Xray); «aviso»: it will be less precise. Pure:
 * the page shows it before «Generar informe» and the team gets it in its brief.
 */

export type ProblemaDatos = { nivel: "grave" | "aviso"; pais: string | null; texto: string };

const DIA = 86_400_000;
/** An Xray older than this no longer shows today's market. */
const XRAY_VIEJO_DIAS = 90;
/** Leaders that should have their full reviews uploaded. */
const LIDERES_CON_RESENAS = 5;

const normal = (t: string) =>
  t
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
const palabras = (t: string) => normal(t).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4);

export function revisarDatos(estudio: EstudioH10, palabrasEstudio: Record<string, PalabrasMercado>, costesPropios: boolean, hoy = new Date()): ProblemaDatos[] {
  const salida: ProblemaDatos[] = [];
  const add = (nivel: ProblemaDatos["nivel"], pais: string | null, texto: string) => salida.push({ nivel, pais, texto });
  if (!estudio.mercados.length) add("grave", null, "No hay ningún Xray: el informe no tiene mercado que analizar.");
  if (!costesPropios) add("aviso", null, "No has puesto tus costes (fábrica y envío) en Rentabilidad: el beneficio, el margen y el precio mínimo saldrán de costes supuestos.");

  for (const m of estudio.mercados) {
    const p = m.codigoPais;
    const pais = nombrePais(p);
    if (!m.competidores.length) {
      add("grave", p, `El Xray de ${pais} no tiene productos: bórralo y vuelve a subirlo (o quítalo si ese país no interesa).`);
      continue;
    }
    if (m.competidores.length < 10) add("aviso", p, `El Xray de ${pais} solo tiene ${m.competidores.length} productos: súbelo completo («Load more» en Helium 10) para ver todo el mercado.`);
    if (!/\p{L}/u.test(m.palabraClave)) add("aviso", p, `El Xray de ${pais} no dice de qué palabra clave es: vuelve a subirlo escribiendo la búsqueda, para cruzarlo con el Cerebro y el historial.`);
    const dias = Math.floor((hoy.getTime() - Date.parse(m.fecha)) / DIA);
    if (dias > XRAY_VIEJO_DIAS) add("aviso", p, `El Xray de ${pais} tiene ${dias} días: el mercado puede haber cambiado; sube uno nuevo.`);
    const sinVentas = m.competidores.filter((c) => c.ventas === null).length;
    if (sinVentas > m.competidores.length / 2) add("aviso", p, `En el Xray de ${pais} faltan las ventas de ${sinVentas} de ${m.competidores.length} productos (¿una captura en vez del CSV?).`);
    for (const a of analizarMercado(m, estudio.busquedas?.[p], estudio.xraysAnteriores?.[p]).avisos) add("aviso", p, `${pais}: ${a}`);

    // Keywords: few, or seemingly of another country (their words hardly appear in that country's titles).
    const cerebro = palabrasEstudio[p]?.palabras ?? [];
    if (!cerebro.length) add("aviso", p, `No hay Cerebro de ${pais}: el PPC y el título de ese país saldrán sin búsquedas reales.`);
    else {
      if (cerebro.length < 30) add("aviso", p, `El Cerebro de ${pais} solo tiene ${cerebro.length} palabras clave (¿una captura?): súbelo en CSV.`);
      const vocabulario = new Set(m.competidores.flatMap((c) => palabras(c.titulo)));
      const top = [...cerebro].sort((a, b) => b.busquedas - a.busquedas).slice(0, 30);
      const conTitulos = top.filter((k) => palabras(k.texto).some((w) => vocabulario.has(w))).length;
      if (top.length >= 10 && conTitulos / top.length < 0.25) add("aviso", p, `Las palabras del Cerebro de ${pais} casi no salen en los títulos de su Xray: ¿es de otro país o de otro producto?`);
    }

    // Search history: short, or out of date.
    const h = estudio.busquedas?.[p];
    if (!h) add("aviso", p, `No hay historial de búsquedas de ${pais}: la temporada y la tendencia saldrán neutras.`);
    else {
      if (h.meses.length < 24) add("aviso", p, `El historial de ${pais} tiene ${h.meses.length} meses: hacen falta 24 para comparar con el año anterior.`);
      const ultimo = h.meses.at(-1)?.mes;
      if (ultimo && ultimo < m.fecha.slice(0, 7)) {
        const [y, mm] = ultimo.split("-").map(Number);
        const [y2, m2] = m.fecha.slice(0, 7).split("-").map(Number);
        if ((y2 - y) * 12 + m2 - mm > 2) add("aviso", p, `El historial de ${pais} acaba en ${ultimo}, meses antes del Xray: súbelo actualizado.`);
      }
    }

    // Full reviews of the leaders.
    const conResenas = new Set<string | null | undefined>((estudio.resenasCompletas ?? []).filter((r) => r.codigoPais === p).map((r) => r.asin));
    const lideres = [...m.competidores].sort((a, b) => b.facturacion - a.facturacion).filter((c) => c.asin).slice(0, LIDERES_CON_RESENAS);
    const faltan = lideres.filter((c) => !conResenas.has(c.asin));
    if (faltan.length) {
      // «Racetex ×3» rather than the brand three times (variations of one listing).
      const marcas = [...faltan.reduce((m, c) => m.set(c.marca, (m.get(c.marca) ?? 0) + 1), new Map<string, number>())].map(([marca, n]) => (n > 1 ? `${marca} ×${n}` : marca));
      add("aviso", p, `Faltan las reseñas completas de ${faltan.length} de los ${lideres.length} líderes de ${pais} (${marcas.join(", ")}).`);
    }
  }

  // Reviews of products that aren't in any Xray (wrong country or a typo in the file).
  const asins = new Set(estudio.mercados.flatMap((m) => m.competidores.map((c) => `${m.codigoPais}|${c.asin}`)));
  const sueltas = (estudio.resenasCompletas ?? []).filter((r) => r.asin && estudio.mercados.some((m) => m.codigoPais === r.codigoPais) && !asins.has(`${r.codigoPais}|${r.asin}`));
  if (sueltas.length) add("aviso", null, `Hay reseñas de ${sueltas.length} ${sueltas.length === 1 ? "producto que no está" : "productos que no están"} en el Xray de su país (${sueltas.slice(0, 4).map((r) => `${r.codigoPais} ${r.asin}`).join(", ")}): ¿país equivocado?`);
  return salida.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "grave" ? -1 : 1));
}

/** For the team's brief. */
export function textoCalidad(problemas: ProblemaDatos[]): string {
  return problemas.length ? `REVISIÓN DE LOS DATOS (hecha por código antes de empezar; tenlo en cuenta y no afirmes con seguridad lo que dependa de esto):\n${problemas.map((p) => `- ${p.nivel === "grave" ? "GRAVE: " : ""}${p.texto}`).join("\n")}` : "";
}
