import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { esperarInforme, imagenesCatalogo, informeJson, pedirInformeMarca, recorrerInformeGrande } from "@/lib/amazon/apis";
import { marketplaceConocido } from "./marketplacesConocidos";
import { ETIQUETAS_POR_ASIN } from "./etiquetas";
import { diaMadrid, sumarDias } from "./fechas";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * Search performance per listing and marketplace, from Amazon's Brand Analytics reports (weekly):
 *
 * - Search Catalog Performance: the listing's impressions, clicks, cart adds and purchases in search.
 * - Search Query Performance: per search query, its volume and the listing's impressions, clicks, cart adds
 *   and purchases against the query's totals.
 * - Search Terms: every search of the marketplace (~400,000 rows, ~150 MB a week) with its popularity rank
 *   and its 3 most clicked products. Read as a stream; only the listing's queries and the niche's are kept.
 * - Market Basket Analysis: the 3 products most often bought together with the listing.
 *
 * One doc per marketplace, `palabrasClave/{marketplaceId}`, kept in memory. A background job brings the new
 * week once Amazon has it (the complete sync starts it; it takes a while: ~1 report a minute).
 */

export const MERCADOS_BUSQUEDA = ["A1RKKUPIHCS9HS", "A1PA6795UKMFR9", "A13V1IB3VIYZZH", "APJ6JRA9NG5V4", "A1805IZSGTT6HS", "A1F83G8C2ARO7P"];
/** The listings followed: the ones with a label (listing viejo / nuevo). */
const ASINS = Object.keys(ETIQUETAS_POR_ASIN);

export type Embudo = { impresiones: number; clics: number; carritos: number; compras: number };
export type Consulta = {
  busqueda: string;
  /** Amazon's popularity rank of the query (1 = most searched). */
  puntuacion: number;
  volumen: number;
  total: Embudo;
  tuyo: Embudo;
  /** Your share of impressions the week before (0–1), to show the trend; null when not known. */
  cuotaImpresionesAnterior: number | null;
  precioMediano: number | null;
  tuPrecio: number | null;
};
/** A popular search of the niche the listing isn't getting clicks from. */
export type Oportunidad = {
  busqueda: string;
  /** Amazon's popularity rank in the marketplace this week (1 = most searched). */
  ranking: number;
  rankingAnterior: number | null;
  /** The 3 most clicked products, with their share of clicks (0–1). */
  top: { asin: string; titulo: string; cuotaClics: number }[];
  /** Your listing's place among the 3 most clicked, or null when it isn't there. */
  tuPosicion: number | null;
};
/** A product bought together with the listing; `porcentaje` (0–1) = Amazon's combination percentage. */
export type CompradoJunto = { asin: string; titulo: string; porcentaje: number };
/** One of the 3 most clicked products of a query; shares 0–1. `propio`: the label of one of your listings. */
export type Competidor = { asin: string; titulo: string; cuotaClics: number; cuotaConversiones: number; esTuyo: boolean; propio?: string | null };
export type RendimientoMercado = {
  marketplaceId: string;
  moneda: string;
  semana: { desde: string; hasta: string } | null;
  catalogo: Embudo | null;
  catalogoAnterior: Embudo | null;
  consultas: Consulta[];
  /** Top 3 clicked products of the listing's main queries (Amazon gives them for queries searched enough). */
  competidores: { busqueda: string; productos: Competidor[] }[];
  cesta: CompradoJunto[];
  oportunidades: Oportunidad[];
};

// ---------- Stored data ----------

type Termino = { ranking: number; top: Competidor[] };
type DocMercado = {
  semana: { desde: string; hasta: string };
  catalogo: Record<string, Embudo>;
  catalogoAnterior: Record<string, Embudo>;
  consultas: Record<string, Consulta[]>;
  /** Search Terms rows kept: the listings' queries and the niche's most searched ones. */
  terminos: Record<string, Termino>;
  /** Popularity rank of the kept terms the week before, for the trend. */
  rankingsAnteriores: Record<string, number>;
  /** Niche terms, most searched first. */
  nicho: string[];
  cesta: Record<string, CompradoJunto[]>;
  actualizadoEn: string;
};

const g = globalThis as unknown as { __palabrasClave?: Map<string, DocMercado | null>; __cargaPalabras?: EstadoCarga };
const cache = () => (g.__palabrasClave ??= new Map());
const ref = (mk: string) => adminDb().collection("palabrasClave").doc(mk);

async function leer(mk: string): Promise<DocMercado | null> {
  if (cache().has(mk)) return cache().get(mk)!;
  const snap = await ref(mk).get();
  contarLecturas(1);
  const doc = snap.exists ? (snap.data() as DocMercado) : null;
  cache().set(mk, doc);
  return doc;
}

// ---------- What the pages read ----------

const cuota = (a: number, b: number) => (b > 0 ? a / b : 0);
const vacio = (mk: string): RendimientoMercado => ({
  marketplaceId: mk,
  moneda: marketplaceConocido(mk)?.moneda ?? "EUR",
  semana: null,
  catalogo: null,
  catalogoAnterior: null,
  consultas: [],
  competidores: [],
  cesta: [],
  oportunidades: [],
});

/** Search performance of a listing in every marketplace (empty ones when Amazon has no data yet). */
export async function rendimientoBusqueda(asin: string): Promise<RendimientoMercado[]> {
  return Promise.all(
    MERCADOS_BUSQUEDA.map(async (mk) => {
      const d = await leer(mk);
      if (!d) return vacio(mk);
      const consultas = [...(d.consultas[asin] ?? [])].sort((a, b) => b.volumen - a.volumen);
      // Main queries: where the listing really competes (most clicks, then impressions) and Amazon gives a top 3.
      const competidores = [...consultas]
        .sort((a, b) => b.tuyo.clics - a.tuyo.clics || b.tuyo.impresiones - a.tuyo.impresiones)
        .filter((q) => d.terminos[q.busqueda]?.top.length)
        .slice(0, 6)
        .map((q) => ({
          busqueda: q.busqueda,
          productos: d.terminos[q.busqueda].top.map((p) => ({ ...p, esTuyo: p.asin === asin, propio: ETIQUETAS_POR_ASIN[p.asin] ?? null })),
        }));
      const conClics = new Set(consultas.filter((q) => q.tuyo.clics > 0).map((q) => q.busqueda));
      const afin = NICHO[mk]?.afin;
      const candidatas = d.nicho.filter((t) => !conClics.has(t) && d.terminos[t]);
      const oportunidades = [...candidatas.filter((t) => afin?.test(t)), ...candidatas.filter((t) => !afin?.test(t))]
        .slice(0, 10)
        .map((t) => {
          const x = d.terminos[t];
          const pos = x.top.findIndex((p) => p.asin === asin);
          return { busqueda: t, ranking: x.ranking, rankingAnterior: d.rankingsAnteriores[t] ?? null, top: x.top, tuPosicion: pos < 0 ? null : pos + 1 };
        });
      return {
        marketplaceId: mk,
        moneda: marketplaceConocido(mk)?.moneda ?? "EUR",
        semana: d.semana,
        catalogo: d.catalogo[asin] ?? null,
        catalogoAnterior: d.catalogoAnterior[asin] ?? null,
        consultas,
        competidores,
        cesta: d.cesta[asin] ?? [],
        oportunidades,
      };
    }),
  );
}

// ---------- Loading a week from Amazon ----------

/** Latest Sunday–Saturday week Amazon has published (a few days after it ends). */
export function ultimaSemana(hoy = diaMadrid(new Date())): { desde: string; hasta: string } {
  const dia = new Date(`${hoy}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  let hasta = sumarDias(hoy, -(dia + 1)); // last Saturday
  if (sumarDias(hasta, 3) > hoy) hasta = sumarDias(hasta, -7);
  return { desde: sumarDias(hasta, -6), hasta };
}

// Words that make a search part of the niche, per marketplace: a football word, and one about training, gifts
// or kids (searches with only the football word are used when there are too few of those).
const NICHO: Record<string, { base: RegExp; afin: RegExp; fuera?: RegExp }> = {
  A1RKKUPIHCS9HS: { base: /f[uú]tbol(?!\s*americano|[ií]n)/, afin: /entrena|alfombra|tapete|esterilla|regalo|habilidad|regate|t[eé]cnica|casa|control/ },
  A1PA6795UKMFR9: { base: /fu(ß|ss)ball(?!tor)/, afin: /training|trainer|matte|geschenk|dribbl|technik|zuhause|skill/ },
  A13V1IB3VIYZZH: { base: /\bfoot(ball)?\b/, afin: /entra[iî]nement|entra[iî]ner|tapis|cadeau|dribbl|technique|maison/, fuera: /am[eé]ricain/ },
  APJ6JRA9NG5V4: { base: /\bcalcio\b/, afin: /allenament|tappetin|tappeto|regal|dribbl|tecnica|casa/, fuera: /magnesio|vitamin|integrator|compresse|potassio/ },
  A1805IZSGTT6HS: { base: /voetbal/, afin: /training|trainen|\bmat\b|cadeau|dribbel|techniek/ },
  A1F83G8C2ARO7P: { base: /\bfootball\b|\bsoccer\b/, afin: /training|trainer|\bmat\b|gift|skill|dribbl|practice|at home/, fuera: /american|nfl/ },
};

type FilaConsulta = {
  asin: string;
  searchQueryData: { searchQuery: string; searchQueryScore: number; searchQueryVolume: number };
  impressionData: { totalQueryImpressionCount: number; asinImpressionCount: number };
  clickData: { totalClickCount: number; asinClickCount: number; totalMedianClickPrice?: { amount: number } | null; asinMedianClickPrice?: { amount: number } | null };
  cartAddData: { totalCartAddCount: number; asinCartAddCount: number };
  purchaseData: { totalPurchaseCount: number; asinPurchaseCount: number };
};
type FilaCatalogo = { asin: string; impressionData: { impressionCount: number }; clickData: { clickCount: number }; cartAddData: { cartAddCount: number }; purchaseData: { purchaseCount: number } };
type FilaCesta = { asin: string; purchasedWithAsin: string; purchasedWithRank: number; combinationPct: number };

async function pedirYEsperar(tipo: string, mk: string, semana: { desde: string; hasta: string }, opciones: Record<string, string>): Promise<string | null> {
  return esperarInforme(await pedirInformeMarca(tipo, mk, semana.desde, semana.hasta, { reportPeriod: "WEEK", ...opciones }));
}

async function consultasDe(mk: string, semana: { desde: string; hasta: string }): Promise<Record<string, Consulta[]>> {
  const id = await pedirYEsperar("GET_BRAND_ANALYTICS_SEARCH_QUERY_PERFORMANCE_REPORT", mk, semana, { asin: ASINS.join(" ") });
  if (!id) return {};
  const { dataByAsin = [] } = await informeJson<{ dataByAsin?: FilaConsulta[] }>("SQP", id);
  const res: Record<string, Consulta[]> = {};
  for (const f of dataByAsin)
    (res[f.asin] ??= []).push({
      busqueda: f.searchQueryData.searchQuery,
      puntuacion: f.searchQueryData.searchQueryScore,
      volumen: f.searchQueryData.searchQueryVolume,
      total: { impresiones: f.impressionData.totalQueryImpressionCount, clics: f.clickData.totalClickCount, carritos: f.cartAddData.totalCartAddCount, compras: f.purchaseData.totalPurchaseCount },
      tuyo: { impresiones: f.impressionData.asinImpressionCount, clics: f.clickData.asinClickCount, carritos: f.cartAddData.asinCartAddCount, compras: f.purchaseData.asinPurchaseCount },
      cuotaImpresionesAnterior: null,
      precioMediano: f.clickData.totalMedianClickPrice?.amount ?? null,
      tuPrecio: f.clickData.asinMedianClickPrice?.amount ?? null,
    });
  return res;
}

async function catalogoDe(mk: string, semana: { desde: string; hasta: string }): Promise<Record<string, Embudo>> {
  const id = await pedirYEsperar("GET_BRAND_ANALYTICS_SEARCH_CATALOG_PERFORMANCE_REPORT", mk, semana, {});
  if (!id) return {};
  const { dataByAsin = [] } = await informeJson<{ dataByAsin?: FilaCatalogo[] }>("SCP", id);
  return Object.fromEntries(
    dataByAsin.map((f) => [f.asin, { impresiones: f.impressionData.impressionCount, clics: f.clickData.clickCount, carritos: f.cartAddData.cartAddCount, compras: f.purchaseData.purchaseCount }]),
  );
}

async function cestaDe(mk: string, semana: { desde: string; hasta: string }): Promise<Record<string, CompradoJunto[]>> {
  const id = await pedirYEsperar("GET_BRAND_ANALYTICS_MARKET_BASKET_REPORT", mk, semana, {});
  if (!id) return {};
  const { dataByAsin = [] } = await informeJson<{ dataByAsin?: FilaCesta[] }>("MBA", id);
  const filas = dataByAsin.filter((f) => ASINS.includes(f.asin)).sort((a, b) => a.purchasedWithRank - b.purchasedWithRank);
  // Product names aren't in the report: the catalog has them.
  const otros = [...new Set(filas.map((f) => f.purchasedWithAsin))];
  const titulos = new Map((otros.length ? await imagenesCatalogo(otros, mk).catch(() => []) : []).map((x) => [x.asin, x.titulo]));
  const res: Record<string, CompradoJunto[]> = {};
  for (const f of filas) (res[f.asin] ??= []).push({ asin: f.purchasedWithAsin, titulo: titulos.get(f.purchasedWithAsin) ?? f.purchasedWithAsin, porcentaje: f.combinationPct });
  return res;
}

/** The week's search terms of the marketplace: the listings' queries and the niche's top searches, with their top 3. */
async function terminosDe(mk: string, semana: { desde: string; hasta: string }, consultas: string[]): Promise<{ terminos: Record<string, Termino>; nicho: string[] }> {
  const id = await pedirYEsperar("GET_BRAND_ANALYTICS_SEARCH_TERMS_REPORT", mk, semana, {});
  if (!id) return { terminos: {}, nicho: [] };
  const buscadas = new Set(consultas);
  const regla = NICHO[mk];
  const terminos: Record<string, Termino> = {};
  // The report comes most searched first, so the niche's top terms are the first ones met: once there are
  // enough, later ones are skipped as they stream by (a broad word like «foot» matches thousands of searches,
  // and keeping them all ran the server out of memory).
  const afines: string[] = [];
  const otras: string[] = [];
  await recorrerInformeGrande(id, (f) => {
    const t = String(f.searchTerm ?? "");
    const propio = ASINS.includes(String(f.clickedAsin));
    let x = terminos[t];
    if (!x) {
      let enNicho = !!regla && regla.base.test(t) && !regla.fuera?.test(t);
      if (enNicho) {
        const lista = regla.afin.test(t) ? afines : otras;
        if (lista.length >= (lista === afines ? 80 : 70)) enNicho = false;
        else lista.push(t);
      }
      if (!buscadas.has(t) && !enNicho && !propio) return;
      x = terminos[t] = { ranking: Number(f.searchFrequencyRank), top: [] };
    }
    if (x.top.length < 3 || propio)
      x.top.push({ asin: String(f.clickedAsin), titulo: String(f.clickedItemName ?? "").slice(0, 160), cuotaClics: Number(f.clickShare) || 0, cuotaConversiones: Number(f.conversionShare) || 0, esTuyo: propio });
  });
  // Kept: the niche's top terms (training/gift ones and others; which to show is decided when the page is
  // shown, so the filter can change without downloading the report again) plus every term of the listings.
  const porRanking = (a: string, b: string) => terminos[a].ranking - terminos[b].ranking;
  const nicho = [...afines, ...otras].sort(porRanking);
  const guardar = new Set([...nicho, ...consultas.filter((c) => terminos[c]), ...Object.keys(terminos).filter((t) => terminos[t].top.some((p) => ASINS.includes(p.asin)))]);
  for (const t of Object.keys(terminos)) {
    if (!guardar.has(t)) delete terminos[t];
    else terminos[t].top.sort((a, b) => b.cuotaClics - a.cuotaClics).splice(3);
  }
  return { terminos, nicho };
}

type EstadoCarga = { en: "curso" | "hecho" | "error"; inicio: string; mercado?: string; paso?: string; hechos: string[]; errores: string[]; fin?: string };

export function estadoCargaPalabras(): EstadoCarga | null {
  return g.__cargaPalabras ?? null;
}

/** Marketplaces whose stored week is older than the latest one Amazon has published. */
export async function mercadosPendientes(): Promise<string[]> {
  const semana = ultimaSemana();
  const res: string[] = [];
  for (const mk of MERCADOS_BUSQUEDA) if ((await leer(mk))?.semana.hasta !== semana.hasta) res.push(mk);
  return res;
}

/**
 * Brings the latest week for the marketplaces that need it, one after the other, in the background (several
 * reports per marketplace and Amazon allows ~1 a minute). Does nothing while a load is running.
 */
export function lanzarCargaPalabras(mercados: string[]): EstadoCarga | null {
  if (g.__cargaPalabras?.en === "curso" || mercados.length === 0) return g.__cargaPalabras ?? null;
  const estado: EstadoCarga = { en: "curso", inicio: new Date().toISOString(), hechos: [], errores: [] };
  g.__cargaPalabras = estado;
  void (async () => {
    const semana = ultimaSemana();
    const anterior = { desde: sumarDias(semana.desde, -7), hasta: sumarDias(semana.hasta, -7) };
    for (const mk of mercados) {
      estado.mercado = mk;
      try {
        const previo = await leer(mk);
        // The week before (for the trends) comes from the stored doc when it's that week; otherwise it's asked for.
        const tienePrevia = previo?.semana.hasta === anterior.hasta;
        estado.paso = "búsquedas";
        const consultas = await consultasDe(mk, semana);
        const consultasPrevias = tienePrevia ? previo.consultas : await consultasDe(mk, anterior);
        estado.paso = "catálogo";
        const catalogo = await catalogoDe(mk, semana);
        const catalogoAnterior = tienePrevia ? previo.catalogo : await catalogoDe(mk, anterior);
        estado.paso = "cesta";
        const cesta = await cestaDe(mk, semana);
        estado.paso = "términos de búsqueda";
        const todas = [...new Set(Object.values(consultas).flatMap((cs) => cs.map((c) => c.busqueda)))];
        const { terminos, nicho } = await terminosDe(mk, semana, todas);

        // Trend: your share of impressions in each query the week before.
        for (const [asin, cs] of Object.entries(consultas))
          for (const c of cs) {
            const p = consultasPrevias[asin]?.find((x) => x.busqueda === c.busqueda);
            c.cuotaImpresionesAnterior = p ? cuota(p.tuyo.impresiones, p.total.impresiones) : null;
          }
        const rankingsAnteriores = tienePrevia ? Object.fromEntries(Object.entries(previo.terminos).map(([t, x]) => [t, x.ranking])) : {};

        const doc: DocMercado = { semana, catalogo, catalogoAnterior, consultas, terminos, rankingsAnteriores, nicho, cesta, actualizadoEn: new Date().toISOString() };
        await ref(mk).set(doc);
        contarEscrituras(1);
        cache().set(mk, doc);
        estado.hechos.push(mk);
      } catch (e) {
        estado.errores.push(`${marketplaceConocido(mk)?.pais ?? mk}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    Object.assign(estado, { en: estado.hechos.length || !estado.errores.length ? "hecho" : "error", fin: new Date().toISOString(), mercado: undefined, paso: undefined });
  })();
  return estado;
}
