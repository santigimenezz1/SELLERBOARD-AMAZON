import type { EstudioH10, MercadoXray, PalabraClave, PalabrasMercado, ResenasCompetidor, ResenasEstudio, TemaResena } from "./h10Tipos";

/*
 * The figures and conclusions of a Helium 10 study, from its Xray captures. Pure functions: everything in euros
 * so countries compare (pounds at a sample rate here; the real import will use the ECB rate of the capture's day).
 */

/** Euros per pound for the preview. */
export const EUR_POR_GBP = 1.16;
const aEur = (v: number, m: MercadoXray) => (m.moneda === "GBP" ? v * EUR_POR_GBP : v);
const redondear = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const acotar = (v: number) => Math.min(10, Math.max(1, v));

export type AnalisisMercado = {
  mercado: MercadoXray;
  facturacionEur: number;
  precioMedioEur: number;
  /** Share of the visible competitors' revenue taken by the top 3. */
  cuotaTop3: number;
  /** 1 (easy) – 10 (very hard). */
  dificultad: number;
  /** 1 – 10: money at stake against how hard it is to get in. */
  oportunidad: number;
  avisos: string[];
};

/**
 * Difficulty: reviews you'd have to compete with (log scale: 50 → ~3, 1,000 → ~9), eased when small sellers already
 * make money (top 10 under 75 reviews) and raised when the top 3 take most of the market.
 */
function dificultad(m: MercadoXray, cuotaTop3: number): number {
  const resenas = (Math.log10(Math.max(m.resenasMedias, 10)) / Math.log10(2000)) * 10;
  return redondear(acotar(resenas - m.top10Menos75 * 0.6 + (cuotaTop3 - 0.5) * 4), 1);
}

/** Opportunity: size of the market (log scale: 20,000 € → ~4, 500,000 € → ~9) minus a share of the difficulty. */
function oportunidad(facturacionEur: number, dif: number): number {
  const tamano = (Math.log10(Math.max(facturacionEur, 1000)) - 3) * 3.3;
  return redondear(acotar(tamano + 2.5 - dif * 0.45), 1);
}

export function analizarMercado(m: MercadoXray): AnalisisMercado {
  const facturacionEur = aEur(m.facturacionTotal, m);
  const visibles = [...m.competidores].sort((a, b) => b.facturacion - a.facturacion);
  const totalVisible = visibles.reduce((s, x) => s + x.facturacion, 0);
  const cuotaTop3 = totalVisible > 0 ? visibles.slice(0, 3).reduce((s, x) => s + x.facturacion, 0) / totalVisible : 0;
  const dif = dificultad(m, cuotaTop3);
  const avisos: string[] = [];
  if (m.busquedas === 0 && m.facturacionTotal > 10000)
    avisos.push("Helium 10 marca 0 búsquedas con mucha facturación: el dato de búsquedas de esta palabra clave no es fiable. Prueba con otra palabra clave.");
  const caidas = m.competidores.filter((x) => x.variacionResenas < -100);
  if (caidas.length)
    avisos.push(`${caidas.length} ${caidas.length === 1 ? "listing perdió" : "listings perdieron"} cientos de reseñas (p. ej. ${caidas[0].marca}): suele ser una variante separada del listing principal.`);
  return { mercado: m, facturacionEur, precioMedioEur: aEur(m.precioMedio, m), cuotaTop3, dificultad: dif, oportunidad: oportunidad(facturacionEur, dif), avisos };
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
  analisis: AnalisisMercado[];
  mejor: AnalisisMercado;
  mercadoTotalEur: number;
  busquedasTotales: number;
  precioRecomendado: { desde: number; hasta: number } | null;
  conclusiones: string[];
};

/** Everything the study page shows. The conclusions are rule-based in the preview; the real one has the AI write them. */
export function resumirEstudio(e: EstudioH10): ResumenEstudio {
  const analisis = e.mercados.map(analizarMercado).sort((a, b) => b.oportunidad - a.oportunidad);
  const mejor = analisis[0];
  const rangos = rangosDePrecio(mejor.mercado);
  const top = [...rangos].sort((a, b) => b.facturacionEur - a.facturacionEur)[0];
  const precioRecomendado = top ? { desde: top.desde, hasta: top.hasta } : null;
  // The brand present in most countries (on a tie, the one that earns more).
  const enMasPaises = [...marcasDelEstudio(e)].sort((a, b) => b.paises.length - a.paises.length || b.facturacionEur - a.facturacionEur)[0];
  const lider = [...mejor.mercado.competidores].sort((a, b) => b.facturacion - a.facturacion)[0];

  const conclusiones = [
    `**${nombrePais(mejor.mercado.codigoPais)} es el mejor mercado** (oportunidad ${nota(mejor.oportunidad)}/10): ${euros(mejor.facturacionEur)} al mes${mejor.mercado.busquedas !== null ? ` y ${entero(mejor.mercado.busquedas)} búsquedas` : ""} para «${mejor.mercado.palabraClave}».${mejor.avisos.length ? " **Ojo:** revisa los avisos sobre sus datos antes de decidir." : ""}`,
    precioRecomendado
      ? `Allí el dinero se concentra entre **${precioRecomendado.desde} y ${precioRecomendado.hasta === Infinity ? "más" : precioRecomendado.hasta} €**; el precio medio es ${euros(mejor.precioMedioEur)}.`
      : "",
    lider ? `El líder es **${lider.marca}** con ${euros(aEur(lider.facturacion, mejor.mercado))} al mes y ${entero(lider.resenas)} reseñas.` : "",
    mejor.cuotaTop3 > 0.6
      ? `Mercado concentrado: los 3 primeros se llevan el ${Math.round(mejor.cuotaTop3 * 100)} % de lo que facturan los competidores visibles.`
      : `Mercado repartido: los 3 primeros se llevan solo el ${Math.round(mejor.cuotaTop3 * 100)} %, hay sitio para nuevos.`,
    ...analisis
      .slice(1)
      .map((a) =>
        a.oportunidad >= 6
          ? `${nombrePais(a.mercado.codigoPais)} también es interesante (${nota(a.oportunidad)}/10, ${euros(a.facturacionEur)} al mes).`
          : `${nombrePais(a.mercado.codigoPais)} es secundario (${nota(a.oportunidad)}/10): ${euros(a.facturacionEur)} al mes${a.dificultad >= 7 ? " y difícil de entrar" : ""}.`,
      ),
    enMasPaises && enMasPaises.paises.length >= 3 ? `**${enMasPaises.marca}** está en ${enMasPaises.paises.length} países: es el competidor a estudiar primero.` : "",
  ].filter(Boolean);

  return {
    analisis,
    mejor,
    mercadoTotalEur: analisis.reduce((s, a) => s + a.facturacionEur, 0),
    busquedasTotales: e.mercados.reduce((s, m) => s + (m.busquedas ?? 0), 0),
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

export type TemaContado = TemaResena & { menciones: number; porcentaje: number; marcas: string[] };

export type AnalisisResenas = {
  analizadas: number;
  /** Average rating of the competitors, weighted by how many reviews each has. */
  valoracionMedia: number;
  /** Share of 1–2 star reviews across the competitors, in %. */
  negativas: number;
  quejas: TemaContado[];
  elogios: TemaContado[];
  porCompetidor: (ResenasCompetidor & { negativas: number; quejaPrincipal: string | null })[];
};

/** How often each theme comes up in the reviews, the competitors' ratings and their main complaint. */
export function analizarResenas(e: ResenasEstudio): AnalisisResenas {
  const todas = e.competidores.flatMap((c) => c.resenas.map((r) => ({ ...r, marca: c.marca })));
  const contar = (tipo: TemaResena["tipo"]) =>
    e.temas
      .filter((t) => t.tipo === tipo)
      .map((t) => {
        const con = todas.filter((r) => r.temas.includes(t.id));
        return { ...t, menciones: con.length, porcentaje: todas.length ? Math.round((con.length / todas.length) * 100) : 0, marcas: [...new Set(con.map((r) => r.marca))] };
      })
      .filter((t) => t.menciones > 0)
      .sort((a, b) => b.menciones - a.menciones);
  const total = e.competidores.reduce((s, c) => s + c.totalResenas, 0);
  const texto = new Map(e.temas.map((t) => [t.id, t.texto]));
  return {
    analizadas: todas.length,
    valoracionMedia: redondear(e.competidores.reduce((s, c) => s + c.valoracion * c.totalResenas, 0) / Math.max(total, 1), 1),
    negativas: Math.round(e.competidores.reduce((s, c) => s + (c.distribucion[3] + c.distribucion[4]) * c.totalResenas, 0) / Math.max(total, 1)),
    quejas: contar("queja"),
    elogios: contar("elogio"),
    porCompetidor: e.competidores.map((c) => {
      const quejas = new Map<string, number>();
      for (const r of c.resenas) for (const t of r.temas) if (e.temas.find((x) => x.id === t)?.tipo === "queja") quejas.set(t, (quejas.get(t) ?? 0) + 1);
      const principal = [...quejas].sort((a, b) => b[1] - a[1])[0];
      return { ...c, negativas: c.distribucion[3] + c.distribucion[4], quejaPrincipal: principal ? (texto.get(principal[0]) ?? null) : null };
    }),
  };
}

export type InformeFinal = {
  nota: number;
  veredicto: "lanzar" | "validar" | "descartar";
  titular: string;
  puntos: { titulo: string; texto: string }[];
};

/**
 * The verdict: the best country's opportunity, nudged up when the competitors' customers complain a lot (room to
 * do better) and down when the data has warnings. ≥ 7 launch, 5–7 validate first, < 5 drop it.
 */
export function informeFinal(resumen: ResumenEstudio, palabras: PalabrasMercado | undefined, resenas: AnalisisResenas | null): InformeFinal {
  const m = resumen.mejor;
  const pais = nombrePais(m.mercado.codigoPais);
  let puntuacion = m.oportunidad;
  if (resenas && resenas.negativas >= 12) puntuacion += 0.4;
  if (m.avisos.length) puntuacion -= 0.8;
  puntuacion = redondear(acotar(puntuacion), 1);
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

  return {
    nota: puntuacion,
    veredicto,
    titular:
      veredicto === "lanzar"
        ? `Lanzar, empezando por ${pais}`
        : veredicto === "validar"
          ? `Prometedor: valida antes con un pedido pequeño en ${pais}`
          : "No compensa: busca otro producto",
    puntos: [
      { titulo: "Dónde", texto: `${pais} primero: ${euros(m.facturacionEur)} al mes y dificultad ${nota(m.dificultad)}/10. ${resumen.analisis.length > 1 ? `Después, ${nombrePais(resumen.analisis[1].mercado.codigoPais)}.` : ""}` },
      precio
        ? { titulo: "Precio", texto: `Entre ${precio.desde} y ${precio.hasta === Infinity ? "más" : precio.hasta} €, donde más se vende en ${pais}${lider ? ` (el líder, ${lider.marca}, está en ${lider.precio.toLocaleString("es-ES")} ${m.mercado.moneda === "GBP" ? "£" : "€"})` : ""}.` }
        : null,
      mejoras.length
        ? {
            titulo: "Cómo diferenciarte",
            texto:
              mejoras
                // After the first, each one goes on in lower case: «…; varillas de fibra…».
                .map((q, i) => `${i ? q.mejora!.charAt(0).toLowerCase() + q.mejora!.slice(1) : q.mejora} (el ${q.porcentaje} % de las reseñas se queja de que «${q.texto.toLowerCase()}»)`)
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
