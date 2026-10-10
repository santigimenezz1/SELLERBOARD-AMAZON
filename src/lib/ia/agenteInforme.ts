import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { limpiarEnv } from "@/lib/env";
import { estudioParaAgente, guardarInforme } from "@/lib/datos/estudiosH10";
import { informeSimulado } from "@/lib/datos/h10InformeSimulado";
import { resumirEstudio } from "@/lib/datos/h10Analisis";
import type { BloqueInforme, InformeEstrategico, PasoEquipo, SeccionInforme } from "@/lib/datos/h10Tipos";
import { describirPaso, ejecutarHerramienta, HERRAMIENTAS } from "./agenteHerramientas";
import { EQUIPO } from "@/lib/datos/h10Equipo";

/*
 * The research team that writes a study's niche report, only when the owner asks for it.
 *
 * 1. Four specialists work at the same time, each with its own tools, web budget and expert brief: market, keywords
 *    and PPC, product and reviews, marketing and listing. Each reads all the data of its part (paging through every
 *    competitor, keyword and review) and hands in a written analysis with its figures and sources.
 * 2. The director gets the four analyses, checks the key figures against the study with the same tools, settles
 *    contradictions, decides the verdict and hands in the report («entregar_informe»).
 *
 * Cost: the specialists run on Sonnet and the director on Opus (env INFORME_MODELO_ESPECIALISTAS / INFORME_MODELO),
 * with prompt caching: what a turn already read is billed at a twentieth in the next ones.
 *
 * Modes (env INFORME_MODO): «ensayo» (default) plays every model with a script that calls the real study tools and
 * hands in the sample report, costing nothing; «real» uses Claude.
 */

export type ModoAgente = "ensayo" | "real";
export type PasoAgente = PasoEquipo;
/** What the team has spent so far: tokens, web searches and their price in dollars. */
export type GastoAgente = { modelo: string; entrada: number; salida: number; cacheEscrita: number; cacheLeida: number; busquedasWeb: number; dolares: number };
export type EstadoInforme = {
  estudioId: string;
  modo: ModoAgente;
  gasto: GastoAgente;
  /** «especialistas» while the four work, «director» while the report is written. */
  fase: "especialistas" | "director";
  empezado: string;
  terminado: string | null;
  pasos: PasoAgente[];
  error: string | null;
};

const DIRECTOR_POR_DEFECTO = "claude-opus-5-5";
const ESPECIALISTAS_POR_DEFECTO = "claude-sonnet-5-5";
const MAX_TURNOS_ESPECIALISTA = 24;
const MAX_TURNOS_DIRECTOR = 16;

/**
 * Dollars per million tokens (input, output, 5-minute cache write, cache read), from Anthropic's pricing page
 * (platform.claude.com/docs/en/about-claude/pricing, October 2026). A model not listed is priced as Opus.
 */
const PRECIOS: Record<string, { entrada: number; salida: number; cacheEscrita: number; cacheLeida: number }> = {
  "claude-opus-5-5": { entrada: 4, salida: 20, cacheEscrita: 5, cacheLeida: 0.2 },
  "claude-sonnet-5-5": { entrada: 2, salida: 10, cacheEscrita: 2.5, cacheLeida: 0.1 },
  "claude-haiku-4-5-20251001": { entrada: 1, salida: 5, cacheEscrita: 1.25, cacheLeida: 0.1 },
};
/** Web search: 10 $ per 1,000 searches (fetching pages costs only its tokens). */
const DOLARES_POR_BUSQUEDA = 0.01;

export const modoAgente = (): ModoAgente => (limpiarEnv(process.env.INFORME_MODO) === "real" ? "real" : "ensayo");
const modeloDirector = () => limpiarEnv(process.env.INFORME_MODELO) || DIRECTOR_POR_DEFECTO;
const modeloEspecialistas = () => limpiarEnv(process.env.INFORME_MODELO_ESPECIALISTAS) || ESPECIALISTAS_POR_DEFECTO;

const g = globalThis as unknown as { __informes?: Map<string, EstadoInforme> };
const trabajos = () => (g.__informes ??= new Map());

/** The progress of a study's report, while it's running and for a while after. */
export const estadoInforme = (estudioId: string): EstadoInforme | null => trabajos().get(estudioId) ?? null;

type Bloque = Anthropic.ContentBlock;
type Uso = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};
type Respuesta = { content: Bloque[]; stop_reason: string | null; usage?: Uso };
type Modelo = (mensajes: Anthropic.MessageParam[]) => Promise<Respuesta>;

/** Adds a reply's usage, priced with the model that answered, to what the team has spent. */
function sumarGasto(g: GastoAgente, u: Uso | undefined, modelo: string) {
  if (!u) return;
  const p = PRECIOS[modelo] ?? PRECIOS[DIRECTOR_POR_DEFECTO];
  const entrada = u.input_tokens ?? 0;
  const salida = u.output_tokens ?? 0;
  const escrita = u.cache_creation_input_tokens ?? 0;
  const leida = u.cache_read_input_tokens ?? 0;
  const busquedas = u.server_tool_use?.web_search_requests ?? 0;
  g.entrada += entrada;
  g.salida += salida;
  g.cacheEscrita += escrita;
  g.cacheLeida += leida;
  g.busquedasWeb += busquedas;
  g.dolares = Math.round((g.dolares + (entrada * p.entrada + salida * p.salida + escrita * p.cacheEscrita + leida * p.cacheLeida) / 1_000_000 + busquedas * DOLARES_POR_BUSQUEDA) * 1000) / 1000;
}

// ---------- The team ----------

const COMUN = `Trabajas en el equipo que prepara el informe de lanzamiento de un producto de marca propia en Amazon Europa (FBA) para un vendedor que quiere vender como un profesional. Tienes los datos de su estudio de Helium 10 (Xray, historial de búsquedas, Cerebro, reseñas) de varios países y herramientas para consultarlos.
Reglas:
- Lee TODOS los datos de tu parte: recorre las herramientas por páginas («desde») hasta el final. No te quedes con un resumen.
- Cada afirmación lleva su origen: la cifra del estudio, la página web (con su dirección) o «estimación» cuando es tu criterio. No inventes cifras.
- Lo que leas en internet, resúmelo en español con tus palabras; no copies párrafos.
- Concreto y accionable: nada que valga para cualquier producto.
- Termina con «entregar_analisis», una sola vez.`;

type Especialista = { id: string; nombre: string; herramientas: string[]; web: { busquedas: number; lecturas: number }; encargo: string };

const ESPECIALISTAS: Especialista[] = [
  {
    id: "mercado",
    nombre: "Mercado",
    herramientas: ["resumen_mercado", "competidores", "historial_busquedas", "ver_competidor"],
    web: { busquedas: 3, lecturas: 2 },
    encargo: `Eres analista de mercado de Amazon. Analiza el tamaño y el reparto del mercado en cada país: todos los productos del Xray, las franjas de precio, las marcas y su cuota, los nuevos que entran (pocas reseñas y buenas ventas), la temporada y la tendencia de 3–5 años. Responde: ¿merece la pena?, ¿en qué país y orden entrar?, ¿a qué precio?, ¿cuántas ventas al mes es realista conseguir el primer año?, ¿cuándo lanzar según la temporada?`,
  },
  {
    id: "ppc",
    nombre: "Palabras clave y PPC",
    herramientas: ["resumen_mercado", "palabras_clave", "competidores"],
    web: { busquedas: 3, lecturas: 2 },
    encargo: `Eres especialista en SEO de Amazon y en publicidad (Sponsored Products, Brands y Display). Recorre TODAS las palabras clave de cada país. Agrúpalas por intención (público, uso, característica). Para cada país: las imprescindibles para el título, las de ventaja (buen volumen y poca competencia en títulos, CPR asumible), las que evitar al principio por caras o dominadas, y las negativas. Diseña la estructura de campañas de lanzamiento (automática, manuales exacta y de frase, de marca y de producto), con pujas de partida, presupuesto diario y cómo evolucionar en las semanas 1–4, 5–8 y 9–12. Calcula el ACoS de equilibrio con el precio y los costes del vendedor (si no los hay, supón y dilo).`,
  },
  {
    id: "producto",
    nombre: "Producto y reseñas",
    herramientas: ["quejas_por_estrellas", "buscar_resenas", "leer_resenas", "ver_competidor"],
    web: { busquedas: 8, lecturas: 6 },
    encargo: `Eres ingeniero de producto y experto en calidad para Amazon. Lee las reseñas de verdad (sobre todo las de 1–3 estrellas de los líderes, en su idioma) y lo que dicen en cada nota. Investiga en internet cómo es el producto por dentro, qué piezas fallan y por qué, materiales y acabados, y la normativa de la UE y del Reino Unido que aplica (seguridad, contacto con alimentos, juguetes, eléctricos, etiquetado, GPSR, EPR…). Entrega: qué fabricar exactamente, las mejoras que atacan cada queja (con cuántas reseñas la sufren), el despiece con las piezas que se gastan, la especificación técnica, los certificados y lo que exigir a la fábrica (pruebas, tolerancias, muestras).`,
  },
  {
    id: "marketing",
    nombre: "Marketing y listing",
    herramientas: ["resumen_mercado", "competidores", "palabras_clave", "buscar_resenas", "leer_resenas"],
    web: { busquedas: 6, lecturas: 4 },
    encargo: `Eres experto en marketing y en listings de Amazon que convierten. Estudia cómo venden los líderes (títulos, precio, propuesta) y el lenguaje con el que los clientes describen lo que quieren y lo que odian en las reseñas. Investiga tendencias de diseño y color de la categoría. Entrega: el posicionamiento y la promesa de la marca, el pack o la oferta que evita competir en precio, el título y los 5 bullets ESCRITOS para el país principal (en su idioma, con sus palabras clave) y la idea para los demás países, el guion de las 9 fotos y del A+, los colores, y el plan de lanzamiento de 90 días (Vine, cupones, precio de entrada, cuándo subirlo, reseñas).`,
  },
];

const ENTREGAR_ANALISIS: Anthropic.Tool = {
  name: "entregar_analisis",
  description: "Entrega tu análisis al director. Una sola vez, al final.",
  input_schema: {
    type: "object",
    properties: {
      analisis: { type: "string", description: "Tu análisis completo en markdown, en español, con las cifras del estudio, tus recomendaciones concretas y el origen de cada dato" },
      fuentes: { type: "array", items: { type: "object", properties: { titulo: { type: "string" }, url: { type: "string" } }, required: ["titulo", "url"] }, description: "Páginas web que has usado" },
    },
    required: ["analisis", "fuentes"],
  },
};

// ---------- The report the director hands in ----------

const ENTREGAR: Anthropic.Tool = {
  name: "entregar_informe",
  description: "Entrega el informe terminado. Llámala una sola vez, al final, con todas las secciones.",
  input_schema: {
    type: "object",
    properties: {
      antetitulo: { type: "string", description: "P. ej. «Análisis de nicho · DE · ES · GB»" },
      titular: { type: "string", description: "Producto y dos puntos, p. ej. «Botella térmica:»" },
      titularDestacado: { type: "string", description: "La idea clave en pocas palabras, p. ej. «gana quien resuelve la tapa»" },
      resumen: { type: "string", description: "3–4 frases: el mercado, la oportunidad y por dónde entrar" },
      veredicto: { type: "string", enum: ["lanzar", "validar", "descartar"] },
      secciones: {
        type: "array",
        description:
          "Secciones en orden: validacion, diferenciacion, oferta, palabras (dónde pujar y dónde no), ppc (estructura de campañas, pujas, presupuesto y plan de 12 semanas), listing (título y bullets escritos, guion de fotos y A+), lanzamiento (plan de 90 días), riesgo, despiece, especificacion, color, decision, produccion",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            etiqueta: { type: "string", description: "Una o dos palabras, p. ej. «Validación»" },
            titulo: { type: "string", description: "Titular de la sección, una idea" },
            bloques: {
              type: "array",
              description:
                "Bloques: {tipo:'texto',texto} · {tipo:'cifras',items:[{valor,etiqueta}]} · {tipo:'destacado',etiqueta,texto} · {tipo:'cita',texto,nota?} · {tipo:'lista',items:[{titulo,texto,prueba?:{tipo:'dato'|'web'|'supuesto',texto,fuente?}}]} · {tipo:'despiece',piezas:[{nombre,detalle,estado:'consumible'|'incluido'|'estructura'|'anadido'}]} · {tipo:'colores',items:[{nombre,hex,nota,estado:'bien'|'regular'|'mal'}],texto?} · {tipo:'pasos',items:[{titulo,texto}]} · {tipo:'palabras',moneda,items:[{texto,busquedas,puja,densidad,cpr,veredicto:'atacar'|'probar'|'evitar',concordancia:'exacta'|'frase'|'amplia'|null,motivo}]} · {tipo:'etiquetas',titulo,tono:'bien'|'mal',items:[...],prueba?}. En los textos, **negrita** para lo importante.",
              items: { type: "object" },
            },
          },
          required: ["id", "etiqueta", "titulo", "bloques"],
        },
      },
      fuentes: {
        type: "array",
        description: "Páginas web citadas con «fuente» en las pruebas, numeradas desde 1 sin saltos",
        items: { type: "object", properties: { n: { type: "integer" }, titulo: { type: "string" }, url: { type: "string" } }, required: ["n", "titulo", "url"] },
      },
    },
    required: ["antetitulo", "titular", "titularDestacado", "resumen", "veredicto", "secciones", "fuentes"],
  },
};

const PREGUNTAR: Anthropic.Tool = {
  name: "preguntar_especialista",
  description: "Pregunta algo a uno de los especialistas sobre su análisis (una duda, una cifra que no cuadra, una contradicción con otro). Responde con su análisis delante. Úsala cuando haga falta, no por rutina.",
  input_schema: {
    type: "object",
    properties: {
      especialista: { type: "string", enum: ["Mercado", "Palabras clave y PPC", "Producto y reseñas", "Marketing y listing"] },
      pregunta: { type: "string" },
    },
    required: ["especialista", "pregunta"],
  },
};

const DIRECTOR = `Eres el director de un equipo de consultores de Amazon FBA. Cuatro especialistas (mercado; palabras clave y PPC; producto y reseñas; marketing y listing) han estudiado a fondo el producto de un vendedor que quiere vender como un profesional. Tu trabajo:
1. Lee sus cuatro análisis.
2. Comprueba con las herramientas del estudio las cifras clave en las que se apoya la decisión (tamaño del mercado, precio, quejas principales, palabras clave). Si algo no te cuadra o dos especialistas se contradicen, pregúntales con «preguntar_especialista» y decide tú con los datos.
3. Decide el veredicto con honestidad: si los datos no lo sostienen, «validar» o «descartar».
4. Escribe el informe con «entregar_informe», una sola vez: claro, directo, concreto y accionable, en español. Que el vendedor sepa exactamente qué fabricar, a qué precio, cómo anunciarlo, cómo lanzarlo y qué exigir a la fábrica.
Reglas del informe:
- Cada afirmación importante lleva su «prueba»: «dato» (cifra del estudio), «web» (número de la fuente) o «supuesto» (criterio o estimación). No inventes cifras.
- Las fuentes, las de los especialistas que uses, numeradas desde 1 sin saltos; cada «fuente» de una prueba tiene que estar en la lista.
- No copies textos de las webs: resúmelos.
- En «palabras», un bloque «palabras» con las de cada veredicto; en «listing», el título y los bullets escritos de verdad en el idioma del país principal.`;

const TIPOS_BLOQUE = new Set(["texto", "cifras", "destacado", "cita", "lista", "despiece", "colores", "pasos", "palabras", "etiquetas"]);

/** The handed-in report, checked enough to render; else what's wrong, for the model to fix. */
function validarInforme(i: unknown): Omit<InformeEstrategico, "generadoEn" | "simulado" | "coste"> | string {
  const o = (i && typeof i === "object" ? i : {}) as Record<string, unknown>;
  for (const k of ["antetitulo", "titular", "titularDestacado", "resumen"]) if (typeof o[k] !== "string" || !o[k]) return `Falta «${k}»`;
  if (!["lanzar", "validar", "descartar"].includes(o.veredicto as string)) return "«veredicto» tiene que ser lanzar, validar o descartar";
  if (!Array.isArray(o.secciones) || o.secciones.length < 3) return "Faltan secciones";
  const secciones: SeccionInforme[] = [];
  for (const s of o.secciones as Record<string, unknown>[]) {
    if (typeof s?.id !== "string" || typeof s.titulo !== "string" || !Array.isArray(s.bloques)) return "Cada sección necesita id, titulo y bloques";
    const malos = (s.bloques as { tipo?: string }[]).filter((b) => !TIPOS_BLOQUE.has(b?.tipo ?? ""));
    if (malos.length) return `Sección «${s.id}»: tipo de bloque desconocido «${malos[0]?.tipo}»`;
    secciones.push({ id: s.id, etiqueta: String(s.etiqueta ?? s.id), titulo: s.titulo, bloques: s.bloques as BloqueInforme[] });
  }
  // Every source a proof cites must be in the list (models tend to number them as they found them).
  const fuentes = Array.isArray(o.fuentes) ? (o.fuentes as InformeEstrategico["fuentes"]) : [];
  const numeros = new Set(fuentes.map((f) => f.n));
  const citadas = JSON.stringify(secciones).match(/"fuente":\s*\d+/g)?.map((x) => Number(x.replace(/\D/g, ""))) ?? [];
  const sueltas = [...new Set(citadas.filter((n) => !numeros.has(n)))];
  if (sueltas.length) return `Las pruebas citan fuentes que no están en «fuentes»: ${sueltas.join(", ")}. Numera las fuentes desde 1 y usa esos números`;
  return {
    antetitulo: o.antetitulo as string,
    titular: o.titular as string,
    titularDestacado: o.titularDestacado as string,
    resumen: o.resumen as string,
    veredicto: o.veredicto as InformeEstrategico["veredicto"],
    secciones,
    fuentes,
  };
}

// ---------- The models ----------

const herramientasDe = (nombres: string[]) => HERRAMIENTAS.filter((h) => nombres.includes(h.name));

/** Claude with prompt caching: the instructions and tools once, then the growing conversation. */
function modeloReal(modelo: string, sistema: string, herramientas: Anthropic.Tool[], web: { busquedas: number; lecturas: number } | null, esfuerzo: "medium" | "high"): Modelo {
  const apiKey = limpiarEnv(process.env.ANTHROPIC_API_KEY);
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY");
  const cliente = new Anthropic({ apiKey });
  // Haiku 4.5 (the cheap one, for tests) only has the basic web tools, no adaptive thinking and no effort setting.
  const basico = modelo.includes("haiku");
  const webTools = !web
    ? []
    : basico
      ? [{ type: "web_search_20250305", name: "web_search", max_uses: web.busquedas }, { type: "web_fetch_20250910", name: "web_fetch", max_uses: web.lecturas }]
      : [{ type: "web_search_20260209", name: "web_search", max_uses: web.busquedas }, { type: "web_fetch_20260209", name: "web_fetch", max_uses: web.lecturas }];
  return async (mensajes) =>
    cliente.messages
      .stream({
        model: modelo,
        max_tokens: basico ? 16000 : 48000,
        ...(!basico && { thinking: { type: "adaptive" as const }, output_config: { effort: esfuerzo } }),
        // A marker on the instructions (tools come before them, so both are cached) plus automatic caching of the
        // conversation as it grows: what a turn already read is billed at a twentieth in the next ones.
        system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
        cache_control: { type: "ephemeral" },
        tools: [...herramientas, ...webTools] as Anthropic.ToolUnion[],
        messages: mensajes,
      })
      .finalMessage();
}

/** The previous tool results, parsed, to let a script choose its next calls from real data. */
function resultados(mensajes: Anthropic.MessageParam[]): Record<string, unknown>[] {
  return mensajes
    .filter((m) => m.role === "user" && Array.isArray(m.content))
    .flatMap((m) => m.content as Anthropic.ToolResultBlockParam[])
    .filter((b) => b.type === "tool_result" && typeof b.content === "string")
    .map((b) => {
      try {
        return JSON.parse(b.content as string) as Record<string, unknown>;
      } catch {
        return {};
      }
    });
}

/** One turn of a rehearsal script: the tool calls to make, chosen from the previous results. */
type TurnoGuion = (previos: Record<string, unknown>[]) => Promise<{ nombre: string; input: Record<string, unknown> }[]>;

/** No AI: plays a model with a script of real tool calls, the last one handing in what the script returns. */
function modeloEnsayo(guion: TurnoGuion[]): Modelo {
  let turno = 0;
  return async (mensajes) => {
    await new Promise((ok) => setTimeout(ok, 900));
    const paso = guion[Math.min(turno++, guion.length - 1)];
    const llamadas = await paso(resultados(mensajes));
    return {
      content: llamadas.map((l, n) => ({ type: "tool_use", id: `ensayo_${turno}_${n}_${Math.random().toString(36).slice(2, 8)}`, name: l.nombre, input: l.input }) as Bloque),
      stop_reason: "tool_use",
    };
  };
}

/** The rehearsal script of each specialist: a couple of real tool calls, then a short analysis built from them. */
function guionEspecialista(e: Especialista, principal: string): TurnoGuion[] {
  const llamadas: Record<string, { nombre: string; input: Record<string, unknown> }[]> = {
    mercado: [{ nombre: "resumen_mercado", input: {} }, { nombre: "historial_busquedas", input: { pais: principal } }],
    ppc: [{ nombre: "palabras_clave", input: { pais: principal, limite: 100 } }, { nombre: "palabras_clave", input: { pais: principal, desde: 100, limite: 100 } }],
    producto: [{ nombre: "quejas_por_estrellas", input: { ambito: "TODOS" } }, { nombre: "leer_resenas", input: { estrellas: 1, cuantas: 30 } }],
    marketing: [{ nombre: "competidores", input: { pais: principal, cuantos: 10 } }, { nombre: "buscar_resenas", input: { texto: "regalo" } }],
  };
  return [
    async () => [llamadas[e.id][0]],
    async () => [llamadas[e.id][1]],
    async (previos: Record<string, unknown>[]) => [
      { nombre: "entregar_analisis", input: { analisis: `(Ensayo) Análisis de ${e.nombre}: ${previos.length} consultas al estudio, ${JSON.stringify(previos).length.toLocaleString("es-ES")} caracteres de datos leídos.`, fuentes: [] } },
    ],
  ];
}

// ---------- One agent's loop ----------

type Entrega = { herramienta: string; input: unknown };

/**
 * Runs one agent until it hands in with «final» (whose input «aceptar» checks: a string sends it back to fix), noting
 * its steps and spending. Returns the accepted hand-in.
 */
async function bucle(opciones: {
  estado: EstadoInforme;
  quien: string;
  modelo: Modelo;
  nombreModelo: string;
  primerMensaje: string;
  final: string;
  aceptar: (input: unknown) => Promise<string | null>;
  maxTurnos: number;
  /** Tools answered by the team instead of the study (asking a specialist). */
  propias?: Record<string, (input: Record<string, unknown>) => Promise<string>>;
}): Promise<Entrega> {
  const { estado, quien, modelo, nombreModelo, final, aceptar } = opciones;
  const paso = (texto: string, tipo: PasoAgente["tipo"]) => estado.pasos.push({ hora: new Date().toISOString(), texto, tipo, quien });
  const mensajes: Anthropic.MessageParam[] = [{ role: "user", content: opciones.primerMensaje }];
  paso(quien === "Director" ? "Recibe los cuatro análisis y empieza a revisarlos" : "Empieza a trabajar", "inicio");
  for (let turno = 0; turno < opciones.maxTurnos; turno++) {
    const r = await modelo(mensajes);
    sumarGasto(estado.gasto, r.usage, nombreModelo);
    if (r.stop_reason === "refusal") throw new Error(`${quien}: la IA no quiso seguir`);
    // Web search and fetch run on Anthropic's side: only noted in the progress.
    for (const b of r.content) if (b.type === "server_tool_use") paso(describirPaso(b.name, b.input), "web");
    if (r.stop_reason === "pause_turn") {
      mensajes.push({ role: "assistant", content: r.content });
      continue;
    }
    const llamadas = r.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!llamadas.length) {
      mensajes.push({ role: "assistant", content: r.content }, { role: "user", content: `Entrega ya con «${final}».` });
      continue;
    }
    if (r.stop_reason === "max_tokens") throw new Error(`${quien}: la respuesta salió demasiado larga y se cortó`);
    mensajes.push({ role: "assistant", content: r.content });
    const respuestas: Anthropic.ToolResultBlockParam[] = [];
    for (const l of llamadas) {
      if (l.name === "preguntar_especialista") estado.pasos.push({ hora: new Date().toISOString(), texto: describirPaso(l.name, l.input), tipo: "consulta", quien, para: String((l.input as { especialista?: unknown })?.especialista ?? "") });
      else paso(describirPaso(l.name, l.input), l.name === final ? "informe" : "estudio");
      if (l.name === final) {
        const problema = await aceptar(l.input);
        if (!problema) return { herramienta: l.name, input: l.input };
        respuestas.push({ type: "tool_result", tool_use_id: l.id, is_error: true, content: `${problema}. Corrígelo y vuelve a entregar.` });
        continue;
      }
      const propia = opciones.propias?.[l.name];
      if (propia) {
        respuestas.push({ type: "tool_result", tool_use_id: l.id, content: await propia((l.input ?? {}) as Record<string, unknown>) });
        continue;
      }
      const res = await ejecutarHerramienta(estado.estudioId, l.name, l.input);
      respuestas.push({ type: "tool_result", tool_use_id: l.id, content: res.texto, ...(res.error && { is_error: true }) });
    }
    mensajes.push({ role: "user", content: respuestas });
  }
  throw new Error(`${quien} no terminó en ${opciones.maxTurnos} pasos`);
}

/** A specialist answers the director's question with its own analysis in front (one short reply, no tools). */
async function responderComoEspecialista(e: Especialista, analisis: string, pregunta: string, contexto: string, gasto: GastoAgente): Promise<string> {
  const apiKey = limpiarEnv(process.env.ANTHROPIC_API_KEY);
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY");
  const modelo = modeloEspecialistas();
  const r = await new Anthropic({ apiKey }).messages.create({
    model: modelo,
    max_tokens: 3000,
    system: `${COMUN}\n\n${e.encargo}`,
    messages: [{ role: "user", content: `${contexto}\n\nTu análisis fue:\n\n${analisis}\n\nLa directora te pregunta: ${pregunta}\n\nResponde en pocas líneas, con las cifras que lo justifican.` }],
  });
  sumarGasto(gasto, r.usage, modelo);
  return r.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n") || "Sin respuesta";
}

// ---------- The whole team ----------

async function trabajar(estado: EstadoInforme) {
  const inicio = Date.now();
  const ensayo = estado.modo === "ensayo";
  const { estudio, palabras } = await estudioParaAgente(estado.estudioId);
  const paises = estudio.mercados.map((m) => m.codigoPais);
  if (!paises.length) throw new Error("El informe necesita al menos el Xray de un país");
  // The study's main country (the one that makes most among the best scored), as the Mercado tab shows it.
  const principal = resumirEstudio(estudio).mejor.mercado.codigoPais;
  const contexto = `Producto: «${estudio.nombre}». País principal: ${principal}. Países con datos: ${paises.join(", ")}. Palabras clave (Cerebro) de: ${Object.keys(palabras).join(", ") || "ninguno"}. Reseñas completas de ${estudio.resenasCompletas?.length ?? 0} productos.`;
  estado.pasos.push({
    hora: new Date().toISOString(),
    texto: ensayo ? "Modo ensayo: sin IA y sin coste. Las herramientas del estudio son las reales" : `Modo real: especialistas con ${modeloEspecialistas()}, director con ${modeloDirector()}`,
    tipo: "aviso",
  });

  // 1. The four specialists, at the same time.
  const analisis = await Promise.all(
    ESPECIALISTAS.map(async (e) => {
      const nombreModelo = ensayo ? "ensayo" : modeloEspecialistas();
      const entrega = await bucle({
        estado,
        quien: e.nombre,
        modelo: ensayo ? modeloEnsayo(guionEspecialista(e, principal)) : modeloReal(nombreModelo, `${COMUN}\n\n${e.encargo}`, [...herramientasDe(e.herramientas), ENTREGAR_ANALISIS], e.web, "high"),
        nombreModelo,
        primerMensaje: `${contexto}\nHaz tu análisis.`,
        final: "entregar_analisis",
        aceptar: async (i) => (typeof (i as { analisis?: unknown })?.analisis === "string" && (i as { analisis: string }).analisis.length > 20 ? null : "Falta el análisis"),
        maxTurnos: MAX_TURNOS_ESPECIALISTA,
      });
      const input = entrega.input as { analisis: string; fuentes?: { titulo: string; url: string }[] };
      return { especialista: e.nombre, analisis: input.analisis, fuentes: input.fuentes ?? [] };
    }),
  );

  // 2. The director checks, decides and writes (it can ask the specialists).
  estado.fase = "director";
  const nombreDirector = ensayo ? "ensayo" : modeloDirector();
  let informe: ReturnType<typeof validarInforme> = "";
  await bucle({
    estado,
    quien: "Director",
    modelo: ensayo
      ? modeloEnsayo([
          async () => [{ nombre: "resumen_mercado", input: {} }],
          async () => [{ nombre: "preguntar_especialista", input: { especialista: "Palabras clave y PPC", pregunta: "¿Por qué evitar la palabra con más búsquedas al principio?" } }],
          // Its date, mock flag and cost are ignored on hand-in, as from the model.
          async () => [{ nombre: "entregar_informe", input: informeSimulado(estudio, palabras) as unknown as Record<string, unknown> }],
        ])
      : modeloReal(nombreDirector, DIRECTOR, [...HERRAMIENTAS, PREGUNTAR, ENTREGAR], null, "high"),
    nombreModelo: nombreDirector,
    primerMensaje: `${contexto}\n\nAnálisis de los especialistas:\n\n${analisis
      .map((a) => `## ${a.especialista}\n\n${a.analisis}${a.fuentes.length ? `\n\nFuentes: ${a.fuentes.map((f) => `${f.titulo} (${f.url})`).join(" · ")}` : ""}`)
      .join("\n\n")}`,
    final: "entregar_informe",
    aceptar: async (i) => {
      informe = validarInforme(i);
      return typeof informe === "string" ? `Informe no válido: ${informe}` : null;
    },
    maxTurnos: MAX_TURNOS_DIRECTOR,
    propias: {
      preguntar_especialista: async (i) => {
        const e = ESPECIALISTAS.find((x) => x.nombre === i.especialista);
        const a = analisis.find((x) => x.especialista === i.especialista);
        if (!e || !a) return "No hay ningún especialista con ese nombre";
        const respuesta = ensayo
          ? `(Ensayo) ${EQUIPO.find((m) => m.quien === e.nombre)?.persona ?? e.nombre} responde: lo he revisado con los datos del estudio y mantengo mi recomendación.`
          : await responderComoEspecialista(e, a.analisis, String(i.pregunta ?? ""), contexto, estado.gasto);
        estado.pasos.push({ hora: new Date().toISOString(), texto: `Responde a la directora: «${respuesta.replace(/\s+/g, " ").slice(0, 110)}…»`, tipo: "respuesta", quien: e.nombre, para: "Director" });
        return respuesta;
      },
    },
  });
  if (typeof informe === "string") throw new Error("El director no entregó un informe válido");
  await guardarInforme(estado.estudioId, {
    ...(informe as Exclude<ReturnType<typeof validarInforme>, string>),
    generadoEn: new Date().toISOString(),
    simulado: ensayo,
    coste: { minutos: Math.max(1, Math.round((Date.now() - inicio) / 60_000)), dolares: estado.gasto.dolares },
    trabajo: { modo: estado.modo, empezado: estado.empezado, terminado: new Date().toISOString(), pasos: [...estado.pasos, { hora: new Date().toISOString(), texto: "Informe guardado", tipo: "informe", quien: "Director" }], analisis, gasto: { ...estado.gasto } },
  });
  estado.pasos.push({ hora: new Date().toISOString(), texto: "Informe guardado", tipo: "informe", quien: "Director" });
}

/** Starts a study's report in the background (once at a time per study). */
export function lanzarInforme(estudioId: string): EstadoInforme {
  const actual = trabajos().get(estudioId);
  if (actual && !actual.terminado) return actual;
  const modo = modoAgente();
  const gasto: GastoAgente = { modelo: modo === "real" ? `${modeloEspecialistas()} + ${modeloDirector()}` : "ensayo", entrada: 0, salida: 0, cacheEscrita: 0, cacheLeida: 0, busquedasWeb: 0, dolares: 0 };
  const estado: EstadoInforme = { estudioId, modo, gasto, fase: "especialistas", empezado: new Date().toISOString(), terminado: null, pasos: [], error: null };
  trabajos().set(estudioId, estado);
  void trabajar(estado)
    .catch((e) => {
      console.error("[agenteInforme]", e);
      estado.error = e instanceof Error ? e.message : "No se pudo hacer el informe";
    })
    .finally(() => {
      estado.terminado = new Date().toISOString();
    });
  return estado;
}
