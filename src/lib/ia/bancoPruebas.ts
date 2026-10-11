import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { contarEscrituras, contarLecturas } from "@/lib/datos/consumo";
import { estudioParaAgente } from "@/lib/datos/estudiosH10";
import { informeSimulado } from "@/lib/datos/h10InformeSimulado";
import { nombrePais, resumirEstudio } from "@/lib/datos/h10Analisis";
import type { BloqueInforme, ControlInforme, InformeEstrategico, SeccionInforme } from "@/lib/datos/h10Tipos";
import type { NivelBanco, PruebaBanco, ResultadoTrampa } from "@/lib/datos/bancoTipos";
import { completarPruebas, modeloDirector, pedirJson, resumenControl, revisarInforme, type EstadoInforme, type GastoAgente, type Leido } from "./agenteInforme";
import { asegurarTarifas, resumenHoja } from "./hojaNumeros";
import { controlarInforme, crearReferencia, normalizarUrl } from "./controlCifras";
import { ejecutarHerramienta } from "./agenteHerramientas";

/*
 * The test bench: the sample report of a study, made clean, with errors planted on purpose, each one imitating a
 * mistake a team member could make. The checker (code, free) and the reviewer (AI, only when asked: it costs) read
 * it, and the bench scores who caught what. At the hard level the specialists' analyses carry the same mistakes, so
 * the reviewer can't catch them by comparing: only by knowing better. A judge model decides whether a finding of the reviewer points to a
 * planted error, since it says it in its own words. Runs are kept in `config/bancoPruebas` to compare over time.
 */

type Informe = InformeEstrategico;
type Contexto = { mercadoEur: number; mesPico: string | null; pais: string };
type Revisado = { problemas: string[]; control: ControlInforme };

type Trampa = {
  id: string;
  experto: string;
  error: string;
  caza: "Verificador" | "Revisor";
  /** Only planted at the hard level. */
  soloDificil?: boolean;
  /** Plants the error; false when the report has no place for it (e.g. no keywords). */
  plantar: (i: Informe, c: Contexto) => boolean;
  /** The checker's: whether it caught it, and what it said. */
  cazada?: (r: Revisado) => string | null;
};

const seccion = (i: Informe, id: string) => i.secciones.find((s) => s.id === id);
const bloque = <T extends BloqueInforme["tipo"]>(s: SeccionInforme | undefined, tipo: T) => s?.bloques.find((b): b is Extract<BloqueInforme, { tipo: T }> => b.tipo === tipo);
const problema = (r: Revisado, ...trozos: string[]) => r.problemas.find((p) => trozos.every((t) => p.includes(t))) ?? null;
const FUENTE_FALSA = "https://www.normativa-botellas-ejemplo.com/lfgb-2026";

const TRAMPAS: Trampa[] = [
  // ---------- For the checker ----------
  {
    id: "mercado-inflado",
    experto: "Mercado",
    error: "Infla el tamaño del mercado (×2,7) en las cifras de Validación",
    caza: "Verificador",
    plantar: (i, c) => {
      const x = bloque(seccion(i, "validacion"), "cifras")?.items.find((y) => /Mercado/.test(y.etiqueta));
      if (!x) return false;
      x.valor = `${Math.round(c.mercadoEur * 2.7 + 13).toLocaleString("es-ES")} €`;
      return true;
    },
    cazada: (r) => r.problemas.find((p) => p.includes("Mercado al mes")) ?? null,
  },
  {
    id: "busquedas-cambiadas",
    experto: "Palabras clave y PPC",
    error: "Triplica las búsquedas de la primera palabra clave de la tabla",
    caza: "Verificador",
    plantar: (i) => {
      const x = bloque(seccion(i, "palabras"), "palabras")?.items[0];
      if (!x) return false;
      x.busquedas = x.busquedas * 3 + 7;
      return true;
    },
    cazada: (r) => problema(r, "Palabras clave", "no está en los datos"),
  },
  {
    id: "quejas-inventadas",
    experto: "Producto y reseñas",
    error: "Inventa cuántas reseñas se quejan de la tapa (4.817)",
    caza: "Verificador",
    plantar: (i) => {
      const x = bloque(seccion(i, "diferenciacion"), "lista")?.items[0];
      if (!x) return false;
      x.prueba = { tipo: "dato", texto: "4.817 reseñas de 1–2★ se quejan de que la tapa gotea" };
      return true;
    },
    cazada: (r) => problema(r, "4.817"),
  },
  {
    id: "fuente-no-visitada",
    experto: "Producto y reseñas",
    error: "Cita una web de normativa que nadie del equipo visitó",
    caza: "Verificador",
    plantar: (i) => {
      const x = bloque(seccion(i, "especificacion"), "lista")?.items[0];
      if (!x) return false;
      const n = Math.max(0, ...i.fuentes.map((f) => f.n)) + 1;
      i.fuentes.push({ n, titulo: "Guía LFGB 2026 para botellas", url: FUENTE_FALSA });
      x.prueba = { tipo: "web", texto: "Guía LFGB 2026 para botellas", fuente: n };
      return true;
    },
    cazada: (r) => problema(r, FUENTE_FALSA),
  },
  {
    id: "sin-prueba",
    experto: "Director",
    error: "Una decisión sin decir de dónde sale",
    caza: "Verificador",
    plantar: (i) => {
      const x = bloque(seccion(i, "decision"), "lista")?.items[0];
      if (!x) return false;
      delete x.prueba;
      return true;
    },
    cazada: (r) => problema(r, "Decisión", "falta «prueba»"),
  },
  {
    id: "sin-confianza",
    experto: "Marketing y listing",
    error: "Una deducción sin su nivel de confianza",
    caza: "Verificador",
    plantar: (i) => {
      const x = bloque(seccion(i, "riesgo"), "lista")?.items.find((y) => y.prueba?.tipo === "supuesto");
      if (!x?.prueba) return false;
      delete x.prueba.confianza;
      return true;
    },
    cazada: (r) => problema(r, "Riesgo", "confianza"),
  },

  // ---------- For the reviewer ----------
  {
    id: "stock-tarde",
    experto: "Mercado",
    error: "Dice que el stock puede llegar después del pico de temporada",
    caza: "Revisor",
    plantar: (i, c) => {
      const x = bloque(seccion(i, "riesgo"), "lista")?.items.find((y) => /Temporada/.test(y.titulo));
      if (!x) return false;
      x.texto = `Puedes enviar el stock a Amazon hasta 2 semanas después del pico${c.mesPico ? ` de ${c.mesPico}` : ""}: así no pagas almacenaje mientras esperas a la temporada.`;
      return true;
    },
  },
  {
    id: "acos-mal",
    experto: "Palabras clave y PPC",
    error: "Calcula mal el ACoS de equilibrio (pone 70 % donde es un 30 %)",
    caza: "Revisor",
    plantar: (i) => {
      const s = seccion(i, "palabras");
      if (!s) return false;
      s.bloques.push({
        tipo: "destacado",
        etiqueta: "ACoS de equilibrio",
        texto: "Precio 29,99 €; coste total por unidad (fábrica, envío y tarifas de Amazon) 21 €: margen de 8,99 €. **ACoS de equilibrio: 70 %**, así que puedes pujar fuerte desde el primer día sin perder dinero.",
      });
      return true;
    },
  },
  {
    id: "titulo-ingles",
    experto: "Marketing y listing",
    error: "Escribe en inglés el título del listing del país principal",
    caza: "Revisor",
    plantar: (i, c) => {
      const s = seccion(i, "oferta");
      if (!s || c.pais === "GB") return false;
      s.bloques.push({
        tipo: "destacado",
        etiqueta: `Título para ${c.pais === "DE" ? "Amazon.de" : `Amazon de ${nombrePais(c.pais)}`}`,
        texto: "«Insulated Water Bottle 1L Stainless Steel – Leak Proof, Keeps Drinks Cold 24h, BPA Free, with Straw Lid and Cleaning Brush»",
      });
      return true;
    },
  },
  {
    id: "sin-lfgb",
    experto: "Producto y reseñas",
    error: "Dice que la declaración de conformidad basta para Alemania (olvida la LFGB)",
    caza: "Revisor",
    plantar: (i) => {
      const x = bloque(seccion(i, "especificacion"), "lista")?.items.find((y) => /LFGB/.test(y.titulo));
      if (!x) return false;
      x.titulo = "Papeles: la declaración de conformidad.";
      x.texto = "Pídela en el RFQ. Con eso basta para vender en toda Europa, también en Alemania: no hace falta ningún ensayo más.";
      return true;
    },
  },
  {
    id: "precio-contradice",
    experto: "Marketing y listing",
    error: "Pone el pack a 14,99 € cuando el informe dice que no se baje de 20 €",
    caza: "Revisor",
    plantar: (i) => {
      const x = bloque(seccion(i, "decision"), "lista")?.items[1];
      if (!x) return false;
      x.texto = "La talla que más vende, a **14,99 €** para entrar con fuerza y ganar ventas rápido.";
      return true;
    },
  },
  {
    id: "compra-enorme",
    experto: "Director",
    error: "Pide 5.000 unidades por color justo donde dice «primera compra corta»",
    caza: "Revisor",
    plantar: (i) => {
      const x = bloque(seccion(i, "decision"), "lista")?.items.find((y) => /compra corta/.test(y.titulo));
      if (!x) return false;
      x.texto = "Salvia, arena y azul niebla: **5.000 unidades de cada color** en el primer pedido, para tener buen precio de fábrica.";
      return true;
    },
  },
  {
    id: "plan-generico",
    experto: "Marketing y listing",
    error: "Un plan de lanzamiento genérico, válido para cualquier producto",
    caza: "Revisor",
    plantar: (i) => {
      const s = seccion(i, "decision");
      if (!s) return false;
      s.bloques.push({ tipo: "destacado", etiqueta: "Plan de lanzamiento", texto: "Haz buenas fotos, consigue reseñas cuanto antes y usa publicidad. Ajusta sobre la marcha según los resultados." });
      return true;
    },
  },
  {
    id: "vine-200",
    experto: "Marketing y listing",
    error: "Manda 200 unidades a Vine (Amazon solo admite hasta 30 por producto)",
    caza: "Revisor",
    soloDificil: true,
    plantar: (i) => {
      const x = bloque(seccion(i, "decision"), "lista")?.items.find((y) => /Vine/.test(y.titulo));
      if (!x) return false;
      x.titulo = "Lanzar con 200 unidades en Vine.";
      x.texto = "Envíalas la primera semana: tendrás unas 200 reseñas antes de la temporada y entrarás directamente en la primera página.";
      return true;
    },
  },
  {
    id: "resenas-pagadas",
    experto: "Marketing y listing",
    error: "Propone regalar repuestos a cambio de reseñas de 5★ (prohibido por Amazon)",
    caza: "Revisor",
    soloDificil: true,
    plantar: (i) => {
      const s = seccion(i, "oferta");
      if (!s) return false;
      s.bloques.push({
        tipo: "destacado",
        etiqueta: "Tarjeta en la caja",
        texto: "Incluye una tarjeta: «Déjanos una reseña de 5★ y te enviamos gratis un juego de juntas de repuesto». Es la forma más rápida de subir la nota en las primeras semanas.",
      });
      return true;
    },
  },
];

/** What each specialist found, correct, as the reviewer gets it in a real report (it checks the report against them). */
function analisisCorrectos(c: Contexto, precio: string): { especialista: string; analisis: string }[] {
  return [
    {
      especialista: "Mercado",
      analisis: `El mercado factura unos ${Math.round(c.mercadoEur).toLocaleString("es-ES")} € al mes. País principal: ${nombrePais(c.pais)}.${c.mesPico ? ` El pico de búsquedas es en ${c.mesPico}: el stock tiene que estar en Amazon 6–8 semanas antes.` : ""} La franja que más vende es ${precio}: no conviene bajar de 20 €, donde están los genéricos. Primera compra corta: 300–500 unidades por color.`,
    },
    {
      especialista: "Palabras clave y PPC",
      analisis: "ACoS de equilibrio = margen antes de publicidad / precio. Con precio de 29,99 € y coste total de 21 € por unidad, el margen es de 8,99 €: ACoS de equilibrio ≈ 30 %. Pujas prudentes las primeras semanas y solo exacta con las palabras de ventaja.",
    },
    {
      especialista: "Producto y reseñas",
      analisis: "Normativa: Reglamento (CE) 1935/2004 y (UE) 10/2011 con declaración de conformidad; en Alemania los compradores y Amazon esperan además el ensayo LFGB; ficha de seguridad para la GPSR. Las quejas de 1–2★ son la tapa que gotea, el frío que no dura y las abolladuras.",
    },
    {
      especialista: "Marketing y listing",
      analisis: `Pack con dos tapas y repuestos, por encima de la franja de ${precio}. El título y los bullets, en el idioma de cada país con sus palabras clave (en alemán para Amazon.de, con «Thermosflasche»). Lanzamiento de 90 días: 30 unidades a Vine la semana 1, cupón del 10 % las semanas 1–4, PPC en exacta con las palabras de ventaja y subida de precio cuando haya 30 reseñas.`,
    },
  ];
}

/** The hard level: the specialists made the same mistakes as the report, so comparing doesn't help. */
function analisisErroneos(c: Contexto, precio: string): { especialista: string; analisis: string }[] {
  return [
    {
      especialista: "Mercado",
      analisis: `El mercado factura unos ${Math.round(c.mercadoEur).toLocaleString("es-ES")} € al mes. País principal: ${nombrePais(c.pais)}.${c.mesPico ? ` El pico de búsquedas es en ${c.mesPico}; el stock puede llegar hasta 2 semanas después del pico, así no se paga almacenaje mientras se espera.` : ""} La franja que más vende es ${precio}. Primera compra: 5.000 unidades por color, para tener buen precio de fábrica.`,
    },
    {
      especialista: "Palabras clave y PPC",
      analisis: "Con precio de 29,99 € y coste total de 21 € por unidad, el margen es de 8,99 €: ACoS de equilibrio del 70 %. Se puede pujar fuerte desde el primer día.",
    },
    {
      especialista: "Producto y reseñas",
      analisis: "Normativa: con la declaración de conformidad (Reglamento (CE) 1935/2004 y (UE) 10/2011) basta para vender en toda la UE, también en Alemania. Las quejas de 1–2★ son la tapa que gotea, el frío que no dura y las abolladuras.",
    },
    {
      especialista: "Marketing y listing",
      analisis: `Pack de entrada a 14,99 €, por debajo de la franja de ${precio}, para ganar ventas rápido. Título para Amazon.de en inglés, que el comprador alemán entiende bien: «Insulated Water Bottle 1L Stainless Steel…». Lanzamiento: 200 unidades a Vine la primera semana y una tarjeta en la caja que regala juntas de repuesto a cambio de una reseña de 5★. Buenas fotos, reseñas y publicidad.`,
    },
  ];
}

const ESQUEMA_JUEZ = {
  type: "object",
  properties: {
    resultados: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          detectado: { type: "boolean" },
          problema: { type: ["string", "null"], description: "El problema del revisor que lo detecta, copiado tal cual; null si ninguno" },
        },
        required: ["id", "detectado", "problema"],
        additionalProperties: false,
      },
    },
  },
  required: ["resultados"],
  additionalProperties: false,
};

const JUEZ = `Eres el juez de un banco de pruebas. En un informe se plantaron errores a propósito y un revisor lo leyó sin saberlo. Para cada error plantado, di si ALGUNO de los problemas que señaló el revisor apunta a ese error concreto, aunque lo diga con otras palabras. Si solo lo roza o habla de otra cosa en la misma sección, no cuenta. Sé estricto y justo.`;
/** The judge: cheap and enough to compare short texts. */
const MODELO_JUEZ = "claude-sonnet-5-5";

const g = globalThis as unknown as { __banco?: PruebaBanco[]; __bancoEnCurso?: boolean };
const ref = () => adminDb().collection("config").doc("bancoPruebas");
const GUARDADAS = 20;

/** The runs so far, newest first. */
export async function listarBanco(): Promise<PruebaBanco[]> {
  if (g.__banco) return g.__banco;
  const snap = await ref().get();
  contarLecturas(1);
  g.__banco = (snap.get("historial") as PruebaBanco[] | undefined) ?? [];
  return g.__banco;
}

/** Runs the bench on a study's data: the checker always, the reviewer only when asked (it costs). */
export async function ejecutarBanco(estudioId: string, conRevisor: boolean, nivel: NivelBanco = "normal"): Promise<PruebaBanco> {
  if (g.__bancoEnCurso) throw new Error("Ya hay una prueba en marcha");
  g.__bancoEnCurso = true;
  try {
    const { estudio, palabras } = await estudioParaAgente(estudioId);
    if (!estudio.mercados.length) throw new Error("El estudio necesita al menos el Xray de un país");
    const r = resumirEstudio(estudio);
    const fuerte = r.mejor.temporada?.fuerte.mes ?? null;
    const c: Contexto = {
      mercadoEur: r.mercadoTotalEur,
      mesPico: fuerte ? new Date(`${fuerte}-01T12:00:00Z`).toLocaleDateString("es-ES", { month: "long" }) : null,
      pais: r.mejor.mercado.codigoPais,
    };
    const limpio = completarPruebas(informeSimulado(estudio, palabras));
    const copia = () => structuredClone(limpio);
    // What the team reads in any report: the study and the market summary the director always checks.
    const resumen = await ejecutarHerramienta(estudioId, "resumen_mercado", {});
    // As in a real report: Amazon's real fees and the numbers sheet, which the reviewer gets too.
    await asegurarTarifas(estudioId).catch(() => []);
    const hoja = await resumenHoja(estudioId);
    const referencia = crearReferencia([{ ...estudio, informe: undefined }, palabras], [...(resumen.error ? [] : [resumen.texto]), ...(hoja.completo ? [hoja.completo] : [])]);
    const urls = new Set(limpio.fuentes.map((f) => normalizarUrl(f.url)));

    // The checker: the clean report (anything flagged is a false alarm), then the one with its errors.
    const falsasAlarmas = controlarInforme(copia(), referencia, urls).problemas;
    const conErrores = copia();
    const plantadas = TRAMPAS.filter((t) => t.caza === "Verificador" && t.plantar(conErrores, c));
    const revisado = controlarInforme(conErrores, referencia, urls);
    const trampas: ResultadoTrampa[] = plantadas.map((t) => {
      const dijo = t.cazada!(revisado);
      return { id: t.id, experto: t.experto, error: t.error, caza: t.caza, cazado: !!dijo, dijo };
    });

    // The reviewer, on the clean report with its own errors, against correct analyses; then the judge.
    const gasto: GastoAgente = { modelo: modeloDirector(), entrada: 0, salida: 0, cacheEscrita: 0, cacheLeida: 0, busquedasWeb: 0, dolares: 0 };
    const paraRevisor = copia();
    const deRevisor = TRAMPAS.filter((t) => t.caza === "Revisor" && (nivel === "dificil" || !t.soloDificil) && t.plantar(paraRevisor, c));
    let otrosRevisor: string[] = [];
    let notaRevisor: number | null = null;
    let consultas: string[] = [];
    if (!conRevisor) {
      for (const t of deRevisor) trampas.push({ id: t.id, experto: t.experto, error: t.error, caza: t.caza, cazado: null, dijo: null });
    } else {
      const precio = r.precioRecomendado ? `${r.precioRecomendado.desde}–${r.precioRecomendado.hasta === Infinity ? "más" : r.precioRecomendado.hasta} €` : "la franja media";
      const contexto = `Producto: «${estudio.nombre}». País principal: ${c.pais}. Países con datos: ${estudio.mercados.map((m) => m.codigoPais).join(", ")}.${hoja.texto ? `\n\n${hoja.texto}` : ""}`;
      // The reviewer works as in a report (checking with the study's tools); its log is the bench's own.
      const estado: EstadoInforme = { estudioId, modo: "real", gasto, fase: "director", empezado: new Date().toISOString(), terminado: null, pasos: [], error: null };
      const leido: Leido = { lecturas: [], urls: new Set() };
      const revision = await revisarInforme(
        false,
        paraRevisor,
        (nivel === "dificil" ? analisisErroneos : analisisCorrectos)(c, precio),
        `${contexto}\n\n${resumenControl(controlarInforme(structuredClone(paraRevisor), referencia, urls).control)}`,
        estado,
        leido,
      );
      consultas = estado.pasos.filter((p) => p.tipo === "estudio").map((p) => p.texto);
      notaRevisor = revision.nota;
      const textos = revision.problemas.map((p) => `[${p.gravedad}] ${p.seccion}: ${p.problema}`);
      const juicio = textos.length
        ? (
            await pedirJson<{ resultados: { id: string; detectado: boolean; problema: string | null }[] }>(
              MODELO_JUEZ,
              JUEZ,
              `Errores plantados:\n${deRevisor.map((t) => `- ${t.id}: ${t.error}`).join("\n")}\n\nProblemas que señaló el revisor:\n${textos.map((t) => `- ${t}`).join("\n")}`,
              ESQUEMA_JUEZ,
              gasto,
            )
          ).resultados
        : [];
      for (const t of deRevisor) {
        const j = juicio.find((x) => x.id === t.id);
        trampas.push({ id: t.id, experto: t.experto, error: t.error, caza: t.caza, cazado: !!j?.detectado, dijo: j?.detectado ? (j.problema ?? null) : null });
      }
      const usados = new Set(juicio.filter((x) => x.detectado && x.problema).map((x) => x.problema!));
      otrosRevisor = textos.filter((t) => ![...usados].some((u) => t.includes(u) || u.includes(t)));
    }

    const prueba: PruebaBanco = {
      fecha: new Date().toISOString(),
      estudio: estudio.nombre,
      conRevisor,
      nivel,
      modelo: conRevisor ? gasto.modelo : null,
      dolares: gasto.dolares,
      trampas,
      falsasAlarmas,
      otrosRevisor,
      notaRevisor,
      ...(conRevisor && { consultasRevisor: consultas }),
    };
    const historial = [prueba, ...(await listarBanco())].slice(0, GUARDADAS);
    await ref().set({ historial, actualizadoEn: prueba.fecha });
    contarEscrituras(1);
    g.__banco = historial;
    return prueba;
  } finally {
    g.__bancoEnCurso = false;
  }
}
