import type { CodigoPais, EstudioH10, HistorialBusquedas, MercadoXray, PalabraClave, PalabrasMercado, ResenasCompetidorH10 } from "./h10Tipos";
import { temporada, type Temporada } from "./h10Temporada";

/*
 * The figures and conclusions of a Helium 10 study, from its Xray captures. Pure functions: everything in euros
 * so countries compare (pounds at a sample rate here; the real import will use the ECB rate of the capture's day).
 */

/** Euros per pound for the preview. */
export const EUR_POR_GBP = 1.16;
const aEur = (v: number, m: MercadoXray) => (m.moneda === "GBP" ? v * EUR_POR_GBP : v);
const redondear = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const acotar = (v: number) => Math.min(10, Math.max(1, v));

/** One part of the score: 1–10 (higher, better) and why, with the study's own figures. */
export type Bloque = { nota: number; texto: string };

/**
 * The score's parts and weights. Reviews hardly count: with Vine and a 4.7 rating a newcomer competes with leaders
 * of 500 reviews, so only markets of thousands of reviews lose points.
 */
export const PESOS = { tamano: 0.4, hueco: 0.25, reparto: 0.15, tendencia: 0.2 } as const;
export const NOMBRES_BLOQUE = { tamano: "Tamaño", hueco: "Hueco para entrar", reparto: "Reparto", tendencia: "Tendencia" } as const;
export type Bloques = Record<keyof typeof PESOS, Bloque>;

export type AnalisisMercado = {
  mercado: MercadoXray;
  /** What the Xray's products make in the month it was taken. */
  facturacionEur: number;
  /**
   * The monthly revenue the market is judged by: the year's average when the keyword's search history is there (an
   * Xray taken in a weak or strong month would mislead), else the Xray's month.
   */
  baseEur: number;
  temporada: Temporada | null;
  precioMedioEur: number;
  /** Share of the visible competitors' revenue taken by the top 3. */
  cuotaTop3: number;
  /** Revenue-weighted rating of the 5 best sellers (CSV exports only), and their reviews. */
  valoracionLideres: number | null;
  resenasLideres: number;
  /** The brand making most here and its share of the visible revenue. */
  marcaLider: { marca: string; cuota: number } | null;
  bloques: Bloques;
  /** 1–10: this country alone, with the same blocks and weights as the study's score. */
  oportunidad: number;
  avisos: string[];
};

/** Market size (log scale: 20,000 € a month → 4,3; 100,000 € → 6,6; 500,000 € → 8,9). */
const tamanoMercado = (eur: number) => acotar((Math.log10(Math.max(eur, 1000)) - 3) * 3.3);
/** Leaders' rating: 4,0 ★ → 9,8 (easy to do better); 4,5 → 6; 4,8 → 3,8 (hard to stand out). */
const notaValoracion = (v: number) => acotar(6 + (4.5 - v) * 7.5);
/** One brand's share of the revenue: 20 % → 10; 40 % → 7,6; 60 % → 5,2; 80 % → 2,8. */
const notaReparto = (cuota: number) => acotar(10 - Math.max(0, cuota - 0.2) * 12);
/** Searches year on year: −20 % → 4; same → 6; +34 % → 9,4. Without history, 6 (neutral). */
const notaTendencia = (crecimiento: number | null) => (crecimiento === null ? 6 : acotar(6 + crecimiento * 10));
const mediaPonderada = (pares: [number, number][]) => {
  const peso = pares.reduce((s, [, p]) => s + p, 0);
  return peso ? pares.reduce((s, [v, p]) => s + v * p, 0) / peso : null;
};
const ponderar = (b: Bloques) => redondear(acotar((Object.keys(PESOS) as (keyof typeof PESOS)[]).reduce((s, k) => s + b[k].nota * PESOS[k], 0)), 1);

/** The «hueco» block: whether a 4.7-rated product stands out against the leaders; only thousands of reviews take points. */
function bloqueHueco(valoracion: number | null, resenas: number): Bloque {
  const penal = resenas > 5000 ? 3 : resenas > 2000 ? 2 : 0;
  const notaBase = valoracion === null ? 6 : notaValoracion(valoracion);
  const sobreValoracion =
    valoracion === null
      ? "Sin valoraciones de los líderes (vienen en el Xray en CSV): nota neutra."
      : `Los que más venden tienen ${nota(redondear(valoracion, 1))} ★ de media: ${valoracion <= 4.4 ? "un producto de 4,7 ★ destaca y les puede quitar ventas" : valoracion >= 4.7 ? "cuesta diferenciarse por calidad" : "hay algo de margen para destacar con mejor calidad"}.`;
  const sobreResenas = penal ? ` Tienen unas ${entero(resenas)} reseñas: −${penal}, difíciles de alcanzar.` : ` Sus reseñas (${entero(resenas)} de media) no son una barrera.`;
  return { nota: redondear(acotar(notaBase - penal), 1), texto: sobreValoracion + sobreResenas };
}

export function analizarMercado(m: MercadoXray, historial?: HistorialBusquedas, anteriores: MercadoXray[] = []): AnalisisMercado {
  const facturacionEur = aEur(m.facturacionTotal, m);
  const visibles = [...m.competidores].sort((a, b) => b.facturacion - a.facturacion);
  const totalVisible = visibles.reduce((s, x) => s + x.facturacion, 0);
  const cuotaTop3 = totalVisible > 0 ? visibles.slice(0, 3).reduce((s, x) => s + x.facturacion, 0) / totalVisible : 0;
  const lideres = visibles.slice(0, 5);
  const valoracionLideres = mediaPonderada(lideres.filter((x) => x.valoracion != null).map((x) => [x.valoracion!, x.facturacion]));
  const resenasLideres = mediaPonderada(lideres.map((x) => [x.resenas, x.facturacion])) ?? 0;
  const porMarca = new Map<string, number>();
  for (const x of visibles) if (x.marca !== "Genérico") porMarca.set(x.marca, (porMarca.get(x.marca) ?? 0) + x.facturacion);
  const primera = [...porMarca].sort((a, b) => b[1] - a[1])[0];
  const marcaLider = primera && totalVisible ? { marca: primera[0], cuota: primera[1] / totalVisible } : null;
  const t = historial ? temporada(m, historial, anteriores) : null;
  const baseEur = t ? aEur(t.mediaMensual, m) : facturacionEur;
  const bloques: Bloques = {
    tamano: { nota: redondear(tamanoMercado(baseEur), 1), texto: `${euros(baseEur)} al mes${t ? " de media en el año" : " (el mes del Xray)"}.` },
    hueco: bloqueHueco(valoracionLideres, resenasLideres),
    reparto: {
      nota: redondear(notaReparto(marcaLider?.cuota ?? 0), 1),
      texto: marcaLider ? `${marcaLider.marca} se lleva el ${Math.round(marcaLider.cuota * 100)} % de lo que facturan los productos visibles.` : "Sin marcas dominantes.",
    },
    tendencia: {
      nota: redondear(notaTendencia(t?.crecimiento ?? null), 1),
      texto: t?.crecimiento != null ? `Búsquedas ${t.crecimiento >= 0 ? "+" : "−"}${Math.abs(Math.round(t.crecimiento * 100))} % frente al año anterior.` : "Sin historial de búsquedas de 2 años: nota neutra.",
    },
  };
  const avisos: string[] = [];
  if (m.busquedas === 0 && m.facturacionTotal > 10000)
    avisos.push("Helium 10 marca 0 búsquedas con mucha facturación: el dato de búsquedas de esta palabra clave no es fiable. Prueba con otra palabra clave.");
  const caidas = m.competidores.filter((x) => x.variacionResenas < -100);
  if (caidas.length)
    avisos.push(`${caidas.length} ${caidas.length === 1 ? "listing perdió" : "listings perdieron"} cientos de reseñas (p. ej. ${caidas[0].marca}): suele ser una variante separada del listing principal.`);
  return {
    mercado: m,
    facturacionEur,
    baseEur,
    temporada: t,
    precioMedioEur: aEur(m.precioMedio, m),
    cuotaTop3,
    valoracionLideres,
    resenasLideres,
    marcaLider,
    bloques,
    oportunidad: ponderar(bloques),
    avisos,
  };
}

/**
 * The study's score: the product in every country together. Size adds the countries up; the other blocks are each
 * country's, weighted by what it makes; the dominant brand is counted across all of them.
 */
export function notaEstudio(e: EstudioH10, analisis: AnalisisMercado[], resenas: AnalisisResenas | null): { nota: number; bloques: Bloques } {
  const total = analisis.reduce((s, a) => s + a.baseEur, 0);
  const pesar = (v: (a: AnalisisMercado) => number | null) =>
    mediaPonderada(analisis.flatMap((a): [number, number][] => {
      const x = v(a);
      return x === null ? [] : [[x, a.baseEur]];
    }));
  const hueco = bloqueHueco(pesar((a) => a.valoracionLideres), pesar((a) => a.resenasLideres) ?? 0);
  // A complaint repeated across several competitors is room for a better product; one-off complaints don't count.
  const repetida = resenas?.quejas.find((q) => q.productos >= 3);
  if (repetida) {
    hueco.nota = redondear(acotar(hueco.nota + 0.5), 1);
    hueco.texto += ` La queja «${repetida.texto.toLowerCase()}» se repite en ${repetida.productos} productos de la competencia: +0,5 (hueco para hacerlo mejor).`;
  }
  const marcas = marcasDelEstudio(e);
  const totalMarcas = analisis.reduce((s, a) => s + a.mercado.competidores.reduce((t, x) => t + aEur(x.facturacion, a.mercado), 0), 0);
  const top = marcas[0];
  const cuota = top && totalMarcas ? top.facturacionEur / totalMarcas : 0;
  const crecimiento = pesar((a) => a.temporada?.crecimiento ?? null);
  const conHistorial = analisis.filter((a) => a.temporada).length;
  const bloques: Bloques = {
    tamano: {
      nota: redondear(tamanoMercado(total), 1),
      texto: `${euros(total)} al mes entre ${analisis.length === 1 ? "el país" : `los ${analisis.length} países`} (${analisis.map((a) => `${a.mercado.codigoPais} ${euros(a.baseEur)}`).join(", ")})${
        conHistorial ? `, ${conHistorial === analisis.length ? "todos" : `${conHistorial} de ${analisis.length}`} con la media del año` : ", cada uno con el mes de su Xray"
      }.`,
    },
    hueco,
    reparto: {
      nota: redondear(notaReparto(cuota), 1),
      texto: top ? `${top.marca} se lleva el ${Math.round(cuota * 100)} % de lo que facturan los productos visibles, en ${top.paises.length} ${top.paises.length === 1 ? "país" : "países"}.` : "Sin marcas dominantes.",
    },
    tendencia: {
      nota: redondear(notaTendencia(crecimiento), 1),
      texto:
        crecimiento !== null
          ? `Búsquedas ${crecimiento >= 0 ? "+" : "−"}${Math.abs(Math.round(crecimiento * 100))} % frente al año anterior (media de los países con historial).`
          : "Sin historial de búsquedas de 2 años: nota neutra. Súbelo para saber si el mercado crece.",
    },
  };
  return { nota: ponderar(bloques), bloques };
}

export type RangoPrecio = { desde: number; hasta: number; facturacionEur: number; competidores: number };

/** Revenue of the visible competitors by price band (10 € wide), in euros. */
export function rangosDePrecio(m: MercadoXray): RangoPrecio[] {
  const rangos = new Map<number, RangoPrecio>();
  for (const x of m.competidores) {
    const precio = aEur(x.precio, m);
    const desde = Math.min(Math.floor(precio / 10) * 10, 100);
    const r = rangos.get(desde) ?? { desde, hasta: desde === 100 ? Infinity : desde + 10, facturacionEur: 0, competidores: 0 };
    r.facturacionEur += aEur(x.facturacion, m);
    r.competidores++;
    rangos.set(desde, r);
  }
  return [...rangos.values()].sort((a, b) => a.desde - b.desde);
}

export type MarcaEstudio = { marca: string; paises: string[]; facturacionEur: number; listings: number };

/** Brands across the study's countries (unbranded products left out), highest revenue first. */
export function marcasDelEstudio(e: EstudioH10): MarcaEstudio[] {
  const marcas = new Map<string, MarcaEstudio>();
  for (const m of e.mercados)
    for (const x of m.competidores) {
      if (x.marca === "Genérico") continue;
      const r = marcas.get(x.marca) ?? { marca: x.marca, paises: [], facturacionEur: 0, listings: 0 };
      if (!r.paises.includes(m.codigoPais)) r.paises.push(m.codigoPais);
      r.facturacionEur += aEur(x.facturacion, m);
      r.listings++;
      marcas.set(x.marca, r);
    }
  return [...marcas.values()].sort((a, b) => b.facturacionEur - a.facturacionEur);
}

const NOMBRE_PAIS: Record<string, string> = { ES: "España", DE: "Alemania", FR: "Francia", IT: "Italia", GB: "Reino Unido" };
export const nombrePais = (codigo: string) => NOMBRE_PAIS[codigo] ?? codigo;
const entero = (v: number) => Math.round(v).toLocaleString("es-ES", { useGrouping: "always" });
const euros = (v: number) => `${entero(v)} €`;
/** A 1–10 score the Spanish way: 8,4. */
const nota = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 1 });

export type ResumenEstudio = {
  estudio: EstudioH10;
  analisis: AnalisisMercado[];
  mejor: AnalisisMercado;
  mercadoTotalEur: number;
  /** Searches of the countries that have them; null when none does. */
  busquedasTotales: number | null;
  precioRecomendado: { desde: number; hasta: number } | null;
  conclusiones: string[];
};

/** Everything the study page shows. The conclusions are rule-based in the preview; the real one has the AI write them. */
export function resumirEstudio(e: EstudioH10): ResumenEstudio {
  const analisis = e.mercados.map((m) => analizarMercado(m, e.busquedas?.[m.codigoPais], e.xraysAnteriores?.[m.codigoPais])).sort((a, b) => b.oportunidad - a.oportunidad);
  // The country to start with: the one that makes most among those scoring within half a point of the best (a tenth
  // more in a small market doesn't beat twice the money).
  const mejor = analisis.filter((a) => a.oportunidad >= analisis[0].oportunidad - 0.5).sort((a, b) => b.baseEur - a.baseEur)[0];
  const rangos = rangosDePrecio(mejor.mercado);
  const top = [...rangos].sort((a, b) => b.facturacionEur - a.facturacionEur)[0];
  const precioRecomendado = top ? { desde: top.desde, hasta: top.hasta } : null;
  // The brand present in most countries (on a tie, the one that earns more).
  const enMasPaises = [...marcasDelEstudio(e)].sort((a, b) => b.paises.length - a.paises.length || b.facturacionEur - a.facturacionEur)[0];
  const lider = [...mejor.mercado.competidores].sort((a, b) => b.facturacion - a.facturacion)[0];

  const conclusiones = [
    `**${nombrePais(mejor.mercado.codigoPais)} es el mejor mercado** (oportunidad ${nota(mejor.oportunidad)}/10): ${mejor.temporada ? `unos ${euros(mejor.baseEur)} al mes de media en el año (el Xray, de un solo mes, daba ${euros(mejor.facturacionEur)})` : `${euros(mejor.facturacionEur)} al mes`}${mejor.mercado.busquedas !== null ? ` y ${entero(mejor.mercado.busquedas)} búsquedas` : ""}${/\p{L}/u.test(mejor.mercado.palabraClave) ? ` para «${mejor.mercado.palabraClave}»` : ""}.${mejor.avisos.length ? " **Ojo:** revisa los avisos sobre sus datos antes de decidir." : ""}`,
    precioRecomendado
      ? `Allí el dinero se concentra entre **${precioRecomendado.desde} y ${precioRecomendado.hasta === Infinity ? "más" : precioRecomendado.hasta} €**; el precio medio es ${euros(mejor.precioMedioEur)}.`
      : "",
    lider ? `El líder es **${lider.marca}** con ${euros(aEur(lider.facturacion, mejor.mercado))} al mes y ${entero(lider.resenas)} reseñas.` : "",
    mejor.cuotaTop3 > 0.6
      ? `Mercado concentrado: los 3 primeros se llevan el ${Math.round(mejor.cuotaTop3 * 100)} % de lo que facturan los competidores visibles.`
      : `Mercado repartido: los 3 primeros se llevan solo el ${Math.round(mejor.cuotaTop3 * 100)} %, hay sitio para nuevos.`,
    ...analisis
      .filter((a) => a !== mejor)
      .map((a) =>
        a.oportunidad >= 6
          ? `${nombrePais(a.mercado.codigoPais)} también es interesante (${nota(a.oportunidad)}/10, ${euros(a.baseEur)} al mes).`
          : `${nombrePais(a.mercado.codigoPais)} es secundario (${nota(a.oportunidad)}/10): ${euros(a.baseEur)} al mes.`,
      ),
    enMasPaises && enMasPaises.paises.length >= 3 ? `**${enMasPaises.marca}** está en ${enMasPaises.paises.length} países: es el competidor a estudiar primero.` : "",
  ].filter(Boolean);

  return {
    estudio: e,
    analisis,
    mejor,
    mercadoTotalEur: analisis.reduce((s, a) => s + a.baseEur, 0),
    busquedasTotales: e.mercados.some((m) => m.busquedas !== null) ? e.mercados.reduce((s, m) => s + (m.busquedas ?? 0), 0) : null,
    precioRecomendado,
    conclusiones,
  };
}

// ---------- Keywords (phase 2) ----------

export type ClasePalabra = "imprescindible" | "oportunidad" | "secundaria" | "sinDatos";

/**
 * Imprescindible: lots of searches and the leaders already carry it in their titles (you must have it too).
 * Oportunidad: a fair number of searches but few titles use it (easier to rank for). The rest, secondary.
 */
export function clasificarPalabra(p: PalabraClave, maxBusquedas: number): ClasePalabra {
  if (p.busquedas === 0) return "sinDatos";
  if (p.busquedas >= maxBusquedas * 0.3 && p.densidadTitulos >= 5) return "imprescindible";
  if (p.busquedas >= Math.max(maxBusquedas * 0.08, 250) && p.densidadTitulos <= 3) return "oportunidad";
  return "secundaria";
}

// Words that carry no meaning on their own, in the four languages.
const VACIAS = new Set(["de", "la", "el", "para", "con", "y", "für", "mit", "und", "der", "die", "das", "for", "the", "and", "with", "of", "pour", "le", "les", "du", "et", "à", "2er", "set"]);

export type PalabraTitulo = { palabra: string; busquedas: number; frases: number };

/** The words worth having in the title: each word's searches summed over the phrases that contain it. */
export function palabrasParaTitulo(palabras: PalabraClave[], max = 12): PalabraTitulo[] {
  const suma = new Map<string, PalabraTitulo>();
  for (const p of palabras)
    for (const w of new Set(p.texto.toLowerCase().split(/\s+/))) {
      if (VACIAS.has(w) || w.length < 3) continue;
      const r = suma.get(w) ?? { palabra: w, busquedas: 0, frases: 0 };
      r.busquedas += p.busquedas;
      r.frases++;
      suma.set(w, r);
    }
  return [...suma.values()].sort((a, b) => b.busquedas - a.busquedas).slice(0, max);
}

export type PosicionRival = { rival: string; enTop10: number; enTop100: number; posicionMedia: number | null; busquedasCaptadas: number; mejores: { texto: string; posicion: number; busquedas: number }[] };

/** Where each tracked competitor ranks: keywords in its top 10, average position and the searches it catches (top 10 only). */
export function posicionesDeRivales(m: PalabrasMercado): PosicionRival[] {
  return m.rivales.map((rival, i) => {
    const con = m.palabras.filter((p) => p.posiciones[i] !== null).map((p) => ({ texto: p.texto, posicion: p.posiciones[i]!, busquedas: p.busquedas }));
    const top10 = con.filter((x) => x.posicion <= 10);
    return {
      rival,
      enTop10: top10.length,
      enTop100: con.length,
      posicionMedia: con.length ? redondear(con.reduce((s, x) => s + x.posicion, 0) / con.length, 1) : null,
      busquedasCaptadas: top10.reduce((s, x) => s + x.busquedas, 0),
      mejores: [...con].sort((a, b) => a.posicion - b.posicion || b.busquedas - a.busquedas).slice(0, 5),
    };
  });
}

// ---------- Reviews and final report (phase 3) ----------

/** A review theme across the competitors: how often it comes up, in how many products and countries, and examples. */
export type TemaResenas = {
  texto: string;
  tipo: "queja" | "elogio";
  /** For complaints: what your product should do about it (only once the AI has grouped the themes). */
  mejora: string;
  menciones: number;
  /** Competitor products (ASIN × country) whose reviews mention it. */
  productos: number;
  marcas: string[];
  paises: CodigoPais[];
  /** Average effect on the star rating Helium 10 gives it (+ lifts, − sinks), null when not given. */
  impacto: number | null;
  ejemplos: { texto: string; marca: string; pais: CodigoPais }[];
  /** The topics as Helium 10 wrote them. */
  originales: string[];
};

export type CompetidorResenas = ResenasCompetidorH10 & { quejaPrincipal: string | null; elogioPrincipal: string | null };

export type AnalisisResenas = {
  competidores: CompetidorResenas[];
  quejas: TemaResenas[];
  elogios: TemaResenas[];
  /** Whether the themes come from the AI's grouping (in Spanish, with improvements) or straight from Helium 10. */
  agrupado: boolean;
  /** Review files uploaded after the last grouping: «Analizar con IA» again to take them in. */
  sinAgrupar: number;
};

/**
 * The competitors' reviews from Helium 10's «Review Analysis» files: the AI's common themes when there are, else each
 * Helium 10 topic on its own. A product uploaded twice (same ASIN and country) counts once.
 */
export function analizarResenas(e: EstudioH10): AnalisisResenas | null {
  const vistos = new Set<string>();
  const competidores = (e.resenasH10 ?? []).filter((c) => {
    const clave = `${c.codigoPais}-${c.asin ?? c.archivoId}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
  if (!competidores.length) return null;
  const nombre = (c: ResenasCompetidorH10) => c.marca ?? c.asin ?? "Competidor";
  const temaDe = (c: ResenasCompetidorH10, tipo: "queja" | "elogio", tema: string) => (tipo === "queja" ? c.negativos : c.positivos).find((t) => t.tema === tema);
  const agrupado = e.resenasAgrupadas;
  // Each group gathers topics of some files; the topics no group took (files uploaded later) go on their own.
  const grupos: { texto: string; tipo: "queja" | "elogio"; mejora: string; fuentes: { c: ResenasCompetidorH10; tema: string }[] }[] = [];
  const usados = new Set<string>();
  for (const g of agrupado?.temas ?? []) {
    const fuentes = g.fuentes.flatMap((f) => {
      const c = competidores.find((x) => x.archivoId === f.archivoId);
      if (!c || !temaDe(c, f.tipo, f.tema)) return [];
      usados.add(`${c.archivoId}|${f.tipo}|${f.tema}`);
      return [{ c, tema: f.tema }];
    });
    if (fuentes.length) grupos.push({ texto: g.texto, tipo: g.tipo, mejora: g.mejora, fuentes });
  }
  for (const c of competidores)
    for (const tipo of ["queja", "elogio"] as const)
      for (const t of tipo === "queja" ? c.negativos : c.positivos) {
        if (usados.has(`${c.archivoId}|${tipo}|${t.tema}`)) continue;
        const g = grupos.find((x) => !x.mejora && x.tipo === tipo && x.texto.toLowerCase() === t.tema.toLowerCase());
        if (g) g.fuentes.push({ c, tema: t.tema });
        else grupos.push({ texto: t.tema, tipo, mejora: "", fuentes: [{ c, tema: t.tema }] });
      }
  const temas = grupos.map((g): TemaResenas => {
    // A topic can be both praised and criticised (e.g. assembly): a complaint takes only what sinks the rating.
    const impactos = g.fuentes.flatMap(({ c, tema }) => c.impacto.filter((i) => i.tema === tema && (g.tipo === "queja" ? i.valor < 0 : i.valor > 0)).map((i) => i.valor));
    return {
      texto: g.texto,
      tipo: g.tipo,
      mejora: g.mejora,
      menciones: g.fuentes.reduce((s, { c, tema }) => s + (temaDe(c, g.tipo, tema)?.menciones ?? 0), 0),
      productos: new Set(g.fuentes.map(({ c }) => `${c.codigoPais}-${c.asin ?? c.archivoId}`)).size,
      marcas: [...new Set(g.fuentes.map(({ c }) => nombre(c)))],
      paises: [...new Set(g.fuentes.map(({ c }) => c.codigoPais))],
      impacto: impactos.length ? redondear(impactos.reduce((s, x) => s + x, 0) / impactos.length, 2) : null,
      ejemplos: g.fuentes.flatMap(({ c, tema }) => (temaDe(c, g.tipo, tema)?.ejemplos ?? []).map((texto) => ({ texto, marca: nombre(c), pais: c.codigoPais }))),
      originales: [...new Set(g.fuentes.map(({ tema }) => tema))],
    };
  });
  const orden = (a: TemaResenas, b: TemaResenas) => b.productos - a.productos || b.menciones - a.menciones;
  const principal = (c: ResenasCompetidorH10, tipo: "queja" | "elogio") =>
    temas.filter((t) => t.tipo === tipo && grupos[temas.indexOf(t)].fuentes.some((f) => f.c === c)).sort(orden)[0]?.texto ?? null;
  return {
    competidores: competidores.map((c) => ({ ...c, quejaPrincipal: principal(c, "queja"), elogioPrincipal: principal(c, "elogio") })),
    quejas: temas.filter((t) => t.tipo === "queja").sort(orden),
    elogios: temas.filter((t) => t.tipo === "elogio").sort(orden),
    agrupado: !!agrupado,
    sinAgrupar: competidores.filter((c) => !agrupado?.archivos.includes(c.archivoId)).length,
  };
}

/**
 * The product's score, every country together: the study's blocks, 0,8 less when the best market's data has
 * warnings. The same figure everywhere it shows (study cards, Mercado, verdict).
 */
export function notaProducto(resumen: ResumenEstudio, resenas: AnalisisResenas | null): { nota: number; bloques: Bloques } {
  const { nota: base, bloques } = notaEstudio(resumen.estudio, resumen.analisis, resenas);
  return { nota: resumen.mejor.avisos.length ? redondear(acotar(base - 0.8), 1) : base, bloques };
}

export type InformeFinal = {
  nota: number;
  /** How the score came out, step by step with this study's figures. */
  desglose: string[];
  veredicto: "lanzar" | "validar" | "descartar";
  titular: string;
  puntos: { titulo: string; texto: string }[];
};

/**
 * The verdict: the best country's opportunity, nudged up when the competitors' customers complain a lot (room to
 * do better) and down when the data has warnings. ≥ 7 launch, 5–7 validate first, < 5 drop it.
 */
/** The profit figures the report needs (from h10Rentabilidad, for the best country). */
export type RentabilidadInforme = { beneficio: number; margen: number; beneficioMes5: number; inversion5: number; meses5: number | null };

export function informeFinal(resumen: ResumenEstudio, palabras: PalabrasMercado | undefined, resenas: AnalisisResenas | null, rentabilidad?: RentabilidadInforme): InformeFinal {
  const m = resumen.mejor;
  const pais = nombrePais(m.mercado.codigoPais);
  const { nota: base, bloques } = notaProducto(resumen, resenas);
  let puntuacion = base;
  // A big market is worth nothing if each sale earns little: profit weighs in.
  if (rentabilidad) {
    if (rentabilidad.beneficio <= 0) puntuacion -= 4;
    else if (rentabilidad.margen < 0.1) puntuacion -= 2;
    else if (rentabilidad.margen >= 0.25) puntuacion += 0.3;
  }
  puntuacion = redondear(acotar(puntuacion), 1);
  const desglose = [
    ...(Object.keys(PESOS) as (keyof typeof PESOS)[]).map((k) => `**${NOMBRES_BLOQUE[k]} ${nota(bloques[k].nota)}/10** (${Math.round(PESOS[k] * 100)} %): ${bloques[k].texto}`),
    `**Nota final ${nota(puntuacion)}/10**${m.avisos.length ? " (−0,8 por datos dudosos)" : ""}. 7 o más: lanzar · 5–7: validar · menos de 5: descartar.`,
  ];
  const veredicto = puntuacion >= 7 ? "lanzar" : puntuacion >= 5 ? "validar" : "descartar";
  const max = palabras ? Math.max(...palabras.palabras.map((p) => p.busquedas)) : 0;
  const clave = palabras
    ? [...palabras.palabras]
        .sort((a, b) => b.busquedas - a.busquedas)
        .filter((p) => clasificarPalabra(p, max) === "imprescindible")
        .slice(0, 2)
        .map((p) => `«${p.texto}»`)
    : [];
  const lider = [...m.mercado.competidores].sort((a, b) => b.facturacion - a.facturacion)[0];
  const mejoras = resenas?.quejas.filter((q) => q.mejora).slice(0, 3) ?? [];
  const precio = resumen.precioRecomendado;
  const siguiente = [...resumen.analisis].filter((a) => a !== m).sort((a, b) => b.baseEur - a.baseEur)[0];

  return {
    nota: puntuacion,
    desglose,
    veredicto,
    titular:
      veredicto === "lanzar"
        ? `Lanzar, empezando por ${pais}`
        : veredicto === "validar"
          ? `Prometedor: valida antes con un pedido pequeño en ${pais}`
          : "No compensa: busca otro producto",
    puntos: [
      rentabilidad
        ? {
            titulo: "Rentabilidad",
            texto:
              rentabilidad.beneficio <= 0
                ? `Con tus costes perderías ${euros(-rentabilidad.beneficio)} por unidad en ${pais}: hace falta un producto más barato o un precio más alto.`
                : `Ganarías unos ${euros(rentabilidad.beneficio)} por unidad (${Math.round(rentabilidad.margen * 100)} % de margen). Con un 5 % del mercado, ${euros(rentabilidad.beneficioMes5)} al mes; inversión de ${euros(rentabilidad.inversion5)}${rentabilidad.meses5 !== null ? ` que recuperas en unos ${nota(rentabilidad.meses5)} meses` : ""}.`,
          }
        : null,
      { titulo: "Dónde", texto: `${pais} primero: ${euros(m.baseEur)} al mes${m.temporada ? " de media en el año" : ""}. ${siguiente ? `Después, ${nombrePais(siguiente.mercado.codigoPais)}.` : ""}` },
      precio
        ? { titulo: "Precio", texto: `Entre ${precio.desde} y ${precio.hasta === Infinity ? "más" : precio.hasta} €, donde más se vende en ${pais}${lider ? ` (el líder, ${lider.marca}, está en ${lider.precio.toLocaleString("es-ES")} ${m.mercado.moneda === "GBP" ? "£" : "€"})` : ""}.` }
        : null,
      mejoras.length
        ? {
            titulo: "Cómo diferenciarte",
            texto:
              mejoras
                // After the first, each one goes on in lower case: «…; varillas de fibra…».
                .map((q, i) => {
                  const x = q.mejora.replace(/\.\s*$/, "");
                  return `${i ? x.charAt(0).toLowerCase() + x.slice(1) : x} (${q.productos === 1 ? "lo critican en 1 producto" : `lo critican en ${q.productos} productos`}: «${q.texto.toLowerCase()}»)`;
                })
                .join("; ") + ".",
          }
        : null,
      clave.length ? { titulo: "Título del listing", texto: `Tiene que llevar ${clave.join(" y ")}.` } : null,
      {
        titulo: "Riesgos",
        texto: [
          lider ? `${lider.marca} domina con ${entero(lider.resenas)} reseñas` : "",
          m.cuotaTop3 > 0.6 ? `los 3 primeros se llevan el ${Math.round(m.cuotaTop3 * 100)} % del mercado visible` : "",
          m.avisos.length ? "hay datos dudosos de Helium 10 en ese país (mira los avisos)" : "",
        ]
          .filter(Boolean)
          .join("; ")
          .replace(/^./, (c) => c.toUpperCase()) + ".",
      },
    ].filter((x): x is { titulo: string; texto: string } => x !== null),
  };
}
