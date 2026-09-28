import "server-only";

import { marketplaceConocido } from "./marketplacesConocidos";

/*
 * Search performance per listing and marketplace, shaped like Amazon's Brand Analytics reports:
 *
 * - Search Catalog Performance: the listing's impressions, clicks, cart adds and purchases in search.
 * - Search Query Performance: per search query, its volume and the listing's share of impressions, clicks,
 *   cart adds and purchases.
 * - Top search terms: the 3 most clicked products of each query.
 * - Market Basket Analysis: the 3 products most often bought in the same order as the listing.
 * - Search Terms: every search of the marketplace with its popularity rank and its 3 most clicked products,
 *   filtered to the niche's words; the ones not bringing clients to the listing yet are opportunities.
 *
 * EXAMPLE DATA for now (made up, stable per listing and country) until the app gets the Brand Analytics role.
 */

export const DATOS_DE_EJEMPLO = true;

export const MERCADOS_BUSQUEDA = ["A1RKKUPIHCS9HS", "A1PA6795UKMFR9", "A13V1IB3VIYZZH", "APJ6JRA9NG5V4", "A1805IZSGTT6HS", "A1F83G8C2ARO7P"];

export type Embudo = { impresiones: number; clics: number; carritos: number; compras: number };
export type Consulta = {
  busqueda: string;
  /** Amazon's popularity rank of the query (1 = most searched). */
  puntuacion: number;
  volumen: number;
  total: Embudo;
  tuyo: Embudo;
  /** Your share of impressions the week before, to show the trend. */
  cuotaImpresionesAnterior: number;
  precioMediano: number;
  tuPrecio: number;
};
/** A popular search of the niche the listing isn't getting clients from yet. */
export type Oportunidad = {
  busqueda: string;
  /** Amazon's popularity rank in the marketplace this week (1 = most searched). */
  ranking: number;
  rankingAnterior: number;
  /** The 3 most clicked products, with their share of clicks. */
  top: { asin: string; titulo: string; cuotaClics: number }[];
  /** Your listing's place among the 3 most clicked, or null when it isn't there. */
  tuPosicion: number | null;
};
/** A product bought in the same order as the listing; `porcentaje` = share of the listing's orders that include it. */
export type CompradoJunto = { asin: string; titulo: string; porcentaje: number };
export type Competidor = { asin: string; titulo: string; cuotaClics: number; cuotaConversiones: number; esTuyo: boolean };
export type RendimientoMercado = {
  marketplaceId: string;
  moneda: string;
  semana: { desde: string; hasta: string };
  catalogo: Embudo;
  catalogoAnterior: Embudo;
  consultas: Consulta[];
  /** Top 3 clicked products of each main query (Amazon gives them for the most searched ones). */
  competidores: { busqueda: string; productos: Competidor[] }[];
  /** Top 3 products bought together with the listing (Market Basket Analysis). */
  cesta: CompradoJunto[];
  /** Searches of the niche (Search Terms) the listing isn't getting clients from yet. */
  oportunidades: Oportunidad[];
};

// Search queries of a football training mat, in each marketplace's language.
const BUSQUEDAS: Record<string, string[]> = {
  A1RKKUPIHCS9HS: ["alfombra entrenamiento futbol", "alfombra futbol niños", "regalo niño futbol", "esterilla entrenamiento futbol", "accesorios futbol niños", "tapete futbol", "entrenamiento futbol casa", "regalos futboleros"],
  A1PA6795UKMFR9: ["fußball trainingsmatte", "fußball geschenke jungen", "fußball training kinder", "trainingsmatte fußball", "fussball matte", "fußball zubehör kinder", "dribbling training", "fußball geschenk"],
  A13V1IB3VIYZZH: ["tapis entrainement football", "cadeau football garçon", "tapis football enfant", "accessoire football", "entrainement foot maison", "tapis de foot", "cadeau foot enfant", "jeux football"],
  APJ6JRA9NG5V4: ["tappetino allenamento calcio", "regali calcio bambino", "allenamento calcio casa", "tappeto calcio", "accessori calcio bambini", "regalo calcio"],
  A1805IZSGTT6HS: ["voetbal trainingsmat", "voetbal cadeau jongen", "voetbal training thuis", "voetbalmat"],
  A1F83G8C2ARO7P: ["football training mat", "football gifts for boys", "football training equipment", "football mat", "football skills mat", "football gifts", "kids football training", "soccer training mat"],
};

// Popular searches of the niche that bring the listing no clients yet (example data).
const OPORTUNIDADES: Record<string, string[]> = {
  A1RKKUPIHCS9HS: ["regalos niño 8 años", "juguetes futbol niños", "regalo niño 10 años", "entrenador de futbol", "material entrenamiento futbol", "juegos para niños activos"],
  A1PA6795UKMFR9: ["geschenk junge 8 jahre", "fußball spielzeug", "fußball trainingsgeräte", "geschenke für jungs", "koordinationstraining kinder"],
  A13V1IB3VIYZZH: ["cadeau garçon 8 ans", "jouet football", "materiel entrainement football", "cadeau enfant sportif", "jeux exterieur enfant"],
  APJ6JRA9NG5V4: ["regalo bambino 8 anni", "giochi calcio bambini", "attrezzatura allenamento calcio", "regali per bambini"],
  A1805IZSGTT6HS: ["cadeau jongen 8 jaar", "voetbal speelgoed", "voetbal trainingsmateriaal"],
  A1F83G8C2ARO7P: ["gifts for 8 year old boys", "football toys", "football training equipment for kids", "boys gifts", "football accessories", "garden games for kids"],
};

// Football accessories a mat's buyers could add to the same order (example data).
const COMPLEMENTOS = [
  { asin: "B08KXR3TQ1", titulo: "Conos de entrenamiento de fútbol (pack de 20)" },
  { asin: "B07YL9WZ2C", titulo: "Balón de fútbol talla 4 para niños" },
  { asin: "B09M2P6FHD", titulo: "Escalera de agilidad 6 m con bolsa" },
  { asin: "B0B5T8N1QX", titulo: "Portería de fútbol plegable para jardín" },
  { asin: "B08F7JH4VZ", titulo: "Espinilleras para niños con tobillera" },
  { asin: "B0C3DZ7LWE", titulo: "Rebotador de fútbol para entrenar pases" },
];

/** Deterministic pseudo-random numbers, so the example stays the same on every load. */
function aleatorio(semilla: string) {
  let h = 2166136261;
  for (const c of semilla) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
const redondo = (v: number) => Math.round(v);

function ejemplo(asin: string, marketplaceId: string, nuevo: boolean): RendimientoMercado {
  const r = aleatorio(`${asin}|${marketplaceId}`);
  const entre = (a: number, b: number) => a + (b - a) * r();
  const uk = marketplaceId === "A1F83G8C2ARO7P";
  const tamano = { A1RKKUPIHCS9HS: 1, A1PA6795UKMFR9: 1.6, A13V1IB3VIYZZH: 1.1, APJ6JRA9NG5V4: 0.5, A1805IZSGTT6HS: 0.2, A1F83G8C2ARO7P: 1.3 }[marketplaceId] ?? 0.5;
  const tuPrecio = uk ? 24.99 : nuevo ? 26.99 : 24.71;
  const fuerza = nuevo ? 0.55 : 1;

  const consultas: Consulta[] = (BUSQUEDAS[marketplaceId] ?? []).map((busqueda, i) => {
    const volumen = redondo(entre(900, 6000) * tamano * (1 - i * 0.08));
    const impresiones = redondo(volumen * entre(9, 14));
    const clics = redondo(volumen * entre(0.35, 0.6));
    const carritos = redondo(clics * entre(0.12, 0.2));
    const compras = redondo(carritos * entre(0.45, 0.7));
    const cuotaImp = entre(0.02, 0.18) * fuerza * (1 - i * 0.07);
    const tuyo = {
      impresiones: redondo(impresiones * cuotaImp),
      clics: redondo(clics * cuotaImp * entre(0.9, 1.6)),
      carritos: redondo(carritos * cuotaImp * entre(1, 1.8)),
      compras: redondo(compras * cuotaImp * entre(1, 2)),
    };
    return {
      busqueda,
      puntuacion: redondo(entre(800, 60000) * (1 + i * 0.4)),
      volumen,
      total: { impresiones, clics, carritos, compras },
      tuyo,
      cuotaImpresionesAnterior: Math.max(0, cuotaImp * entre(0.75, 1.25)),
      precioMediano: Math.round(entre(tuPrecio * 0.8, tuPrecio * 1.25) * 100) / 100,
      tuPrecio,
    };
  });

  const suma = (k: keyof Embudo) => consultas.reduce((s, c) => s + c.tuyo[k], 0);
  const catalogo = { impresiones: redondo(suma("impresiones") * 1.4), clics: redondo(suma("clics") * 1.3), carritos: redondo(suma("carritos") * 1.2), compras: redondo(suma("compras") * 1.15) };
  const variar = (e: Embudo) => ({ impresiones: redondo(e.impresiones * entre(0.8, 1.2)), clics: redondo(e.clics * entre(0.8, 1.2)), carritos: redondo(e.carritos * entre(0.8, 1.2)), compras: redondo(e.compras * entre(0.8, 1.2)) });

  // Rival listings, each with a fixed ASIN, so the same competitor shows up across queries.
  const rivales = [
    { asin: "B0C7K2PX4M", titulo: "Soccer Training Mat XL Pro" },
    { asin: "B0D1QW8ZT3", titulo: "Kids Football Skills Mat + App" },
    { asin: "B0BZ9HH6LN", titulo: "Footwork Trainer Anti-Slip Mat" },
    { asin: "B0CX5RM2VA", titulo: "Dribbling Pad Football Training" },
  ];
  // The 3 most clicked products of each query, your listing competing with its own shares of that query.
  const competidores = consultas.slice(0, 6).map((q) => {
    const tuyo: Competidor = {
      asin,
      titulo: "Tu listing",
      cuotaClics: q.total.clics ? q.tuyo.clics / q.total.clics : 0,
      cuotaConversiones: q.total.compras ? q.tuyo.compras / q.total.compras : 0,
      esTuyo: true,
    };
    const otros: Competidor[] = [...rivales]
      .sort(() => r() - 0.5)
      .map((x) => {
        const cuotaClics = entre(0.04, 0.26);
        return { ...x, cuotaClics, cuotaConversiones: cuotaClics * entre(0.8, 1.4), esTuyo: false };
      });
    const productos = [tuyo, ...otros].sort((a, b) => b.cuotaClics - a.cuotaClics).slice(0, 3);
    return { busqueda: q.busqueda, productos };
  });

  return {
    marketplaceId,
    moneda: marketplaceConocido(marketplaceId)?.moneda ?? "EUR",
    semana: { desde: "2026-09-20", hasta: "2026-09-26" },
    catalogo,
    catalogoAnterior: variar(catalogo),
    consultas,
    competidores,
    cesta: [...COMPLEMENTOS]
      .sort(() => r() - 0.5)
      .slice(0, 3)
      .map((c) => ({ ...c, porcentaje: entre(0.015, 0.09) }))
      .sort((a, b) => b.porcentaje - a.porcentaje),
    oportunidades: (OPORTUNIDADES[marketplaceId] ?? [])
      .map((busqueda) => {
        const ranking = Math.round(entre(3000, 120000));
        const cuotas = [entre(0.14, 0.3), entre(0.08, 0.14), entre(0.04, 0.08)];
        const top = [...rivales]
          .sort(() => r() - 0.5)
          .slice(0, 3)
          .map((x, i) => ({ ...x, cuotaClics: cuotas[i] }));
        const tuPosicion = r() < 0.2 ? 3 : null;
        if (tuPosicion) top[2] = { asin, titulo: "Tu listing", cuotaClics: cuotas[2] };
        return { busqueda, ranking, rankingAnterior: Math.round(ranking * entre(0.7, 1.4)), top, tuPosicion };
      })
      .sort((a, b) => a.ranking - b.ranking),
  };
}

/** Search performance of a listing in every marketplace. */
export async function rendimientoBusqueda(asin: string, nuevo: boolean): Promise<RendimientoMercado[]> {
  return MERCADOS_BUSQUEDA.map((mk) => ejemplo(asin, mk, nuevo));
}
