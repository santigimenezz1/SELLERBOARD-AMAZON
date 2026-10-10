import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { estudioParaAgente, todasLasResenas } from "@/lib/datos/estudiosH10";
import { analizarResenas, EUR_POR_GBP, marcasDelEstudio, nombrePais, rangosDePrecio, resumirEstudio } from "@/lib/datos/h10Analisis";
import { esCodigoPais } from "@/lib/datos/h10Tipos";
import { EQUIPO } from "@/lib/datos/h10Equipo";

/*
 * The research agent's tools: read-only questions about the study it's writing the report for (market, keywords,
 * reviews, one competitor). Each returns compact JSON text. The report itself is handed in with «entregar_informe»,
 * whose input is checked in agenteInforme.ts.
 */

type Datos = Awaited<ReturnType<typeof estudioParaAgente>>;

const r1 = (n: number) => Math.round(n * 10) / 10;
const texto = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const entero = (v: unknown, porDefecto: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(1, Math.min(max, Math.round(v))) : porDefecto);

/** Tool definitions sent to the model (the web ones are added in real mode). */
export const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: "resumen_mercado",
    description:
      "Resumen del mercado del estudio en cada país: facturación al mes (media del año), precio con más ventas, temporada (mes fuerte y flojo, crecimiento anual), los 8 competidores que más facturan (marca, ASIN, precio, ventas, facturación, valoración, reseñas) y las marcas con su cuota. Úsala primero.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "palabras_clave",
    description: "Palabras clave del Cerebro de un país con búsquedas al mes, puja PPC sugerida, títulos que la usan (densidad), ventas para entrar en la página 1 (CPR) y tendencia. Puedes filtrar por un texto.",
    input_schema: {
      type: "object",
      properties: {
        pais: { type: "string", description: "ES, DE, FR, IT o GB" },
        contiene: { type: "string", description: "Solo las palabras que contienen este texto (opcional)" },
        desde: { type: "integer", description: "Para recorrerlas todas por páginas: posición desde la que empezar (0 = la más buscada)" },
        limite: { type: "integer", description: "Cuántas devolver, las más buscadas primero (máx. 100, por defecto 40)" },
      },
      required: ["pais"],
      additionalProperties: false,
    },
  },
  {
    name: "quejas_por_estrellas",
    description: "Lo que dicen las reseñas de cada nota (1 a 5 estrellas): quejas y elogios con cuántas reseñas los mencionan. Ámbito «TODOS» o un país. Si no está analizado, usa también los temas de Helium 10 de cada competidor.",
    input_schema: {
      type: "object",
      properties: { ambito: { type: "string", description: "TODOS, ES, DE, FR, IT o GB" } },
      required: ["ambito"],
      additionalProperties: false,
    },
  },
  {
    name: "buscar_resenas",
    description: "Busca un texto en las reseñas completas de los competidores (en su idioma original: busca también la palabra traducida). Devuelve cuántas lo mencionan por estrellas y hasta 12 ejemplos.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Palabra o frase, p. ej. «Deckel» o «leak»" },
        pais: { type: "string", description: "Solo un país (opcional)" },
        estrellas_max: { type: "integer", description: "Solo reseñas con esta nota o menos (opcional)" },
      },
      required: ["texto"],
      additionalProperties: false,
    },
  },
  {
    name: "competidores",
    description: "Todos los productos del Xray de un país, de más a menos facturación, con todos sus datos (precio, ventas, facturación, valoración, reseñas, BSR, tarifa FBA, tamaño, peso, título completo). Por páginas.",
    input_schema: {
      type: "object",
      properties: {
        pais: { type: "string" },
        desde: { type: "integer", description: "Posición desde la que empezar (0 = el que más factura)" },
        cuantos: { type: "integer", description: "Máx. 50, por defecto 25" },
      },
      required: ["pais"],
      additionalProperties: false,
    },
  },
  {
    name: "leer_resenas",
    description: "Lee reseñas completas, enteras y en su idioma, por páginas. Filtra por país, ASIN y nota. Úsala para leer de verdad lo que dicen los clientes, no solo contar.",
    input_schema: {
      type: "object",
      properties: {
        pais: { type: "string", description: "Opcional" },
        asin: { type: "string", description: "Opcional" },
        estrellas: { type: "integer", description: "Solo esta nota (opcional)" },
        desde: { type: "integer", description: "Posición desde la que empezar" },
        cuantas: { type: "integer", description: "Máx. 60, por defecto 30" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "historial_busquedas",
    description: "Búsquedas de la palabra principal de un país mes a mes (hasta 5 años) y la facturación estimada de cada mes: para ver la temporada, la tendencia y cuándo lanzar.",
    input_schema: { type: "object", properties: { pais: { type: "string" } }, required: ["pais"], additionalProperties: false },
  },
  {
    name: "ver_competidor",
    description: "Todo lo que hay de un competidor en un país: su fila del Xray, su puesto y cuota, sus temas de reseñas de Helium 10 y cuántas reseñas completas hay de cada nota.",
    input_schema: {
      type: "object",
      properties: { pais: { type: "string" }, asin: { type: "string" } },
      required: ["pais", "asin"],
      additionalProperties: false,
    },
  },
];

function resumenMercado(d: Datos) {
  const r = resumirEstudio(d.estudio);
  const marcas = marcasDelEstudio(d.estudio);
  const total = marcas.reduce((t, b) => t + b.facturacionEur, 0);
  return {
    producto: d.estudio.nombre,
    // Factory price and freight per unit, for the margin and the break-even ACoS (only when the owner saved his own).
    costesDelVendedor: d.costesPropios && d.estudio.supuestos ? { fabricaEurUnidad: d.estudio.supuestos.costeFabrica, envioEurUnidad: d.estudio.supuestos.envioUnidad } : "No los ha puesto: si hacen falta, di qué supones y márcalo como supuesto",
    mercadoTotalEurMes: Math.round(r.mercadoTotalEur),
    paisPrincipal: r.mejor.mercado.codigoPais,
    precioConMasVentas: r.precioRecomendado,
    paises: r.analisis.map((a) => ({
      pais: a.mercado.codigoPais,
      palabraClave: a.mercado.palabraClave,
      moneda: a.mercado.moneda,
      facturacionMediaEurMes: Math.round(a.baseEur),
      nota: r1(a.oportunidad),
      temporada: a.temporada ? { mesFuerte: a.temporada.fuerte.mes, mesFlojo: a.temporada.flojo.mes, crecimientoAnual: a.temporada.crecimiento === null ? null : r1(a.temporada.crecimiento * 100) } : null,
      rangosPrecio: rangosDePrecio(a.mercado).map((x) => ({ desde: x.desde, hasta: x.hasta === Infinity ? null : x.hasta, facturacionEur: Math.round(x.facturacionEur), productos: x.competidores })),
      lideres: [...a.mercado.competidores]
        .sort((x, y) => y.facturacion - x.facturacion)
        .slice(0, 8)
        .map((c) => ({ marca: c.marca, asin: c.asin ?? null, titulo: c.titulo.slice(0, 120), precio: c.precio, ventas: c.ventas, facturacion: Math.round(c.facturacion), valoracion: c.valoracion ?? null, resenas: c.resenas })),
    })),
    marcas: marcas.slice(0, 10).map((b) => ({ marca: b.marca, paises: b.paises, facturacionEurMes: Math.round(b.facturacionEur), cuota: total ? r1((b.facturacionEur / total) * 100) : 0 })),
  };
}

function palabrasClave(d: Datos, i: Record<string, unknown>) {
  const pais = texto(i.pais, 2).toUpperCase();
  const lista = d.palabras[pais]?.palabras;
  if (!lista?.length) return { error: `No hay palabras clave de ${pais}. Países con Cerebro: ${Object.keys(d.palabras).join(", ") || "ninguno"}` };
  const filtro = texto(i.contiene).toLowerCase();
  return {
    pais,
    total: lista.length,
    palabras: [...lista]
      .filter((p) => !filtro || p.texto.includes(filtro))
      .sort((a, b) => b.busquedas - a.busquedas)
      .slice(Math.max(0, Number(i.desde) || 0), Math.max(0, Number(i.desde) || 0) + entero(i.limite, 40, 100))
      .map((p) => ({ palabra: p.texto, busquedas: p.busquedas, puja: p.pujaPpc, densidadTitulos: p.densidadTitulos, cpr: p.cpr, competidores: p.competidores, tendencia: p.tendencia })),
  };
}

function quejasPorEstrellas(d: Datos, i: Record<string, unknown>) {
  const ambito = texto(i.ambito, 5).toUpperCase() || "TODOS";
  const guardado = d.estudio.estrellasAmbito?.[ambito];
  const h10 = analizarResenas(ambito === "TODOS" ? d.estudio : { ...d.estudio, resenasH10: (d.estudio.resenasH10 ?? []).filter((c) => c.codigoPais === ambito) });
  return {
    ambito,
    porEstrellas: guardado ? guardado.grupos.map((g) => ({ estrellas: g.estrellas, resenas: g.total, leidas: g.leidas ?? g.total, temas: g.temas.map((t) => ({ texto: t.texto, tipo: t.tipo ?? "queja", resenas: t.resenas })) })) : "Sin analizar por estrellas en este ámbito",
    temasHelium10: h10 ? { quejas: h10.quejas.slice(0, 10).map((q) => ({ texto: q.texto, resenas: q.menciones, productos: q.productos })), elogios: h10.elogios.slice(0, 8).map((q) => ({ texto: q.texto, resenas: q.menciones, productos: q.productos })) } : null,
  };
}

async function buscarResenas(id: string, i: Record<string, unknown>) {
  const t = texto(i.texto).toLowerCase();
  if (t.length < 2) return { error: "Escribe al menos 2 letras" };
  const pais = texto(i.pais, 2).toUpperCase();
  const max = entero(i.estrellas_max, 5, 5);
  const todas = (await todasLasResenas(id)).filter((r) => (!pais || r.pais === pais) && r.estrellas <= max);
  const con = todas.filter((r) => `${r.titulo} ${r.texto}`.toLowerCase().includes(t));
  return {
    buscado: t,
    revisadas: todas.length,
    encontradas: con.length,
    porEstrellas: [1, 2, 3, 4, 5].map((e) => ({ estrellas: e, resenas: con.filter((r) => r.estrellas === e).length })),
    ejemplos: con.slice(0, 12).map((r) => ({ pais: r.pais, asin: r.asin, estrellas: r.estrellas, titulo: r.titulo, texto: r.texto.slice(0, 280) })),
  };
}

function competidores(d: Datos, i: Record<string, unknown>) {
  const pais = texto(i.pais, 2).toUpperCase();
  const m = d.estudio.mercados.find((x) => x.codigoPais === pais);
  if (!m) return { error: `No hay Xray de ${pais}. Países: ${d.estudio.mercados.map((x) => x.codigoPais).join(", ")}` };
  const desde = Math.max(0, Number(i.desde) || 0);
  const orden = [...m.competidores].sort((a, b) => b.facturacion - a.facturacion);
  return {
    pais,
    moneda: m.moneda,
    total: orden.length,
    desde,
    productos: orden.slice(desde, desde + entero(i.cuantos, 25, 50)).map((c, n) => ({ ...c, puesto: desde + n + 1 })),
  };
}

async function leerResenas(id: string, i: Record<string, unknown>) {
  const pais = texto(i.pais, 2).toUpperCase();
  const asin = texto(i.asin, 10).toUpperCase();
  const estrellas = typeof i.estrellas === "number" ? i.estrellas : null;
  const todas = (await todasLasResenas(id)).filter((r) => (!pais || r.pais === pais) && (!asin || r.asin === asin) && (estrellas === null || r.estrellas === estrellas));
  const desde = Math.max(0, Number(i.desde) || 0);
  return {
    total: todas.length,
    desde,
    resenas: todas.slice(desde, desde + entero(i.cuantas, 30, 60)).map((r) => ({ pais: r.pais, asin: r.asin, estrellas: r.estrellas, fecha: r.fecha, variante: r.variante, titulo: r.titulo, texto: r.texto })),
  };
}

function historialBusquedas(d: Datos, i: Record<string, unknown>) {
  const pais = texto(i.pais, 2).toUpperCase();
  const h = d.estudio.busquedas?.[pais as keyof NonNullable<typeof d.estudio.busquedas>];
  if (!h) return { error: `No hay historial de búsquedas de ${pais}` };
  const a = resumirEstudio(d.estudio).analisis.find((x) => x.mercado.codigoPais === pais);
  return {
    pais,
    palabraClave: a?.mercado.palabraClave ?? h.palabraClave,
    eurosPorBusqueda: a?.temporada ? r1(a.temporada.porBusqueda) : null,
    meses: h.meses.map((m) => ({ mes: m.mes, busquedas: m.busquedas, facturacionEstimadaEur: a?.temporada ? Math.round(m.busquedas * a.temporada.porBusqueda) : null })),
  };
}

async function verCompetidor(id: string, d: Datos, i: Record<string, unknown>) {
  const pais = texto(i.pais, 2).toUpperCase();
  const asin = texto(i.asin, 10).toUpperCase();
  if (!esCodigoPais(pais)) return { error: "País no válido" };
  const m = d.estudio.mercados.find((x) => x.codigoPais === pais);
  const c = m?.competidores.find((x) => x.asin === asin);
  if (!m || !c) return { error: `No está ${asin} en el Xray de ${nombrePais(pais)}` };
  const orden = [...m.competidores].sort((a, b) => b.facturacion - a.facturacion);
  const total = orden.reduce((t, x) => t + x.facturacion, 0);
  const temas = analizarResenas({ ...d.estudio, resenasH10: (d.estudio.resenasH10 ?? []).filter((x) => x.codigoPais === pais && x.asin === asin) });
  const completas = (await todasLasResenas(id)).filter((r) => r.pais === pais && r.asin === asin);
  return {
    pais,
    moneda: m.moneda,
    competidor: { ...c, puesto: orden.indexOf(c) + 1, cuotaPais: total ? r1((c.facturacion / total) * 100) : 0, facturacionEur: Math.round(m.moneda === "GBP" ? c.facturacion * EUR_POR_GBP : c.facturacion) },
    temasHelium10: temas ? { quejas: temas.quejas.map((q) => ({ texto: q.texto, resenas: q.menciones })), elogios: temas.elogios.map((q) => ({ texto: q.texto, resenas: q.menciones })) } : null,
    resenasCompletas: { total: completas.length, porEstrellas: [1, 2, 3, 4, 5].map((e) => completas.filter((r) => r.estrellas === e).length) },
  };
}

/** Runs one of the study tools; errors come back as text for the model, never thrown. */
export async function ejecutarHerramienta(id: string, nombre: string, entrada: unknown): Promise<{ texto: string; error: boolean }> {
  const i = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  try {
    const d = await estudioParaAgente(id);
    const r =
      nombre === "resumen_mercado"
        ? resumenMercado(d)
        : nombre === "palabras_clave"
          ? palabrasClave(d, i)
          : nombre === "quejas_por_estrellas"
            ? quejasPorEstrellas(d, i)
            : nombre === "buscar_resenas"
              ? await buscarResenas(id, i)
              : nombre === "ver_competidor"
                ? await verCompetidor(id, d, i)
                : nombre === "competidores"
                  ? competidores(d, i)
                  : nombre === "leer_resenas"
                    ? await leerResenas(id, i)
                    : nombre === "historial_busquedas"
                      ? historialBusquedas(d, i)
                      : { error: `Herramienta desconocida: ${nombre}` };
    return { texto: JSON.stringify(r), error: "error" in r };
  } catch (e) {
    return { texto: JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), error: true };
  }
}

/** What the agent is doing, in words for the progress list. */
export function describirPaso(nombre: string, entrada: unknown): string {
  const i = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  switch (nombre) {
    case "resumen_mercado":
      return "Leyendo el mercado de cada país";
    case "palabras_clave":
      return `Revisando las palabras clave de ${nombrePais(String(i.pais ?? ""))}${i.contiene ? ` con «${i.contiene}»` : ""}`;
    case "quejas_por_estrellas":
      return `Revisando qué dicen las reseñas en cada estrella (${i.ambito === "TODOS" ? "todos los países" : nombrePais(String(i.ambito ?? ""))})`;
    case "buscar_resenas":
      return `Buscando «${i.texto}» en las reseñas`;
    case "ver_competidor":
      return `Estudiando el competidor ${i.asin} (${i.pais})`;
    case "competidores":
      return `Revisando los productos del Xray de ${nombrePais(String(i.pais ?? ""))}${i.desde ? ` (desde el ${Number(i.desde) + 1}º)` : ""}`;
    case "leer_resenas":
      return `Leyendo reseñas${i.estrellas ? ` de ${i.estrellas}★` : ""}${i.pais ? ` de ${nombrePais(String(i.pais))}` : ""}${i.asin ? ` de ${i.asin}` : ""}${i.desde ? ` (desde la ${Number(i.desde) + 1}ª)` : ""}`;
    case "historial_busquedas":
      return `Revisando el historial de búsquedas de ${nombrePais(String(i.pais ?? ""))}`;
    case "entregar_analisis":
      return "Entrega su análisis a la directora";
    case "preguntar_especialista":
      return `Pregunta a ${EQUIPO.find((m) => m.quien === i.especialista)?.persona ?? i.especialista}: «${String(i.pregunta ?? "").slice(0, 90)}»`;
    case "web_search":
      return `Buscando en internet: «${i.query ?? ""}»`;
    case "web_fetch":
      return `Leyendo la página ${String(i.url ?? "").replace(/^https?:\/\//, "").slice(0, 60)}`;
    case "entregar_informe":
      return "Escribiendo el informe";
    default:
      return nombre;
  }
}
