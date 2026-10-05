/*
 * Shapes of a Helium 10 study, shared by the stored studies, the sample ones and the views. Amounts are in the
 * marketplace's own currency (`moneda`): the analysis converts them to euros.
 */

// ---------- Xray: one keyword in one country ----------

export type CodigoPais = "ES" | "DE" | "FR" | "IT" | "GB";
export const PAISES_H10: CodigoPais[] = ["ES", "DE", "FR", "IT", "GB"];
export const esCodigoPais = (v: unknown): v is CodigoPais => typeof v === "string" && (PAISES_H10 as string[]).includes(v);

export type CompetidorXray = {
  puesto: number;
  titulo: string;
  marca: string;
  precio: number;
  /** Units sold in the month, when the source has that column. */
  ventas: number | null;
  facturacion: number;
  resenas: number;
  variacionResenas: number;
  /** «AC» = Amazon's Choice, «ABA #1» = Brand Analytics position. */
  etiquetas: string[];
  // Only in CSV exports.
  asin?: string | null;
  valoracion?: number | null;
  bsr?: number | null;
  tarifaFba?: number | null;
  tamano?: string | null;
  peso?: string | null;
};

export type MercadoXray = {
  codigoPais: CodigoPais;
  moneda: "EUR" | "GBP";
  palabraClave: string;
  fecha: string;
  /** Monthly searches of the keyword (null when the source doesn't give it, e.g. an Xray CSV). */
  busquedas: number | null;
  facturacionTotal: number;
  facturacionMedia: number;
  precioMedio: number;
  bsrMedio: number;
  resenasMedias: number;
  /** Of the top 10: how many make more than 5,000 a month, how many have under 75 reviews. */
  top10Mas5000: number;
  top10Menos75: number;
  asins: number;
  competidores: CompetidorXray[];
};

export type EstudioH10 = {
  id: string;
  nombre: string;
  descripcion: string;
  mercados: MercadoXray[];
  /** Amazon's revenue calculator read per country (the latest one). */
  calculadoras?: Partial<Record<CodigoPais, CalculadoraAmazon>>;
  /** The owner's own costs and assumptions for the profitability tab. */
  supuestos?: SupuestosRentabilidad;
  /** A built-in sample study (not stored, can't be changed). */
  ejemplo?: boolean;
};

// ---------- Profitability ----------

/** What Amazon's revenue calculator shows for an ASIN with Logística de Amazon (amounts in the marketplace currency). */
export type CalculadoraAmazon = {
  codigoPais: CodigoPais;
  moneda: "EUR" | "GBP";
  asin: string;
  producto: string;
  precio: number;
  /** Referral fee (Tarifa por referencia), in money. */
  comision: number;
  /** Fulfilment fee (Tarifas de gestión logística). */
  tarifaFba: number;
  /** Storage per unit and month, January–September. */
  almacenamientoMes: number;
  /** VAT rate, in %. */
  iva: number;
  peso: string;
  dimensiones: string;
  fecha: string;
};

/** The owner's numbers: what the calculator can't know. Money in euros, per unit. */
export type SupuestosRentabilidad = {
  /** Factory price per unit. */
  costeFabrica: number;
  /** Freight to Amazon's warehouse plus customs, per unit. */
  envioUnidad: number;
  /** Ad clicks that end in a sale, in %. */
  conversion: number;
  /** Units returned, in %. */
  devoluciones: number;
  /** Average months a unit waits in Amazon's warehouse. */
  mesesStock: number;
  /** One-off launch spend (extra ads, Vine, photos…), in euros. */
  lanzamiento: number;
  /** Your own selling price per country, in euros (else the calculator's, or the same as another country). */
  precios?: Partial<Record<CodigoPais, number>>;
};

export const SUPUESTOS_INICIALES: SupuestosRentabilidad = { costeFabrica: 20, envioUnidad: 6, conversion: 10, devoluciones: 5, mesesStock: 2, lanzamiento: 1500 };

// ---------- Cerebro / Magnet: keywords ----------

export type PalabraClave = {
  texto: string;
  /** Monthly searches. */
  busquedas: number;
  /** Change in searches against the month before, in %. */
  tendencia: number;
  /** Products Amazon shows for it. */
  competidores: number;
  /** Cerebro Product Rank: sales in 8 days needed to reach page one. */
  cpr: number;
  /** How many of the top products carry it in the title. */
  densidadTitulos: number;
  /** Suggested PPC bid, in the marketplace currency. */
  pujaPpc: number;
  /** Organic position of each tracked competitor (null = not in the top 100). Same order as `rivales`. */
  posiciones: (number | null)[];
};

export type PalabrasMercado = { rivales: string[]; palabras: PalabraClave[] };

// ---------- Reviews ----------

export type TemaResena = {
  id: string;
  texto: string;
  tipo: "queja" | "elogio";
  /** For complaints: what your product should do about it. */
  mejora?: string;
};

export type Resena = { estrellas: 1 | 2 | 3 | 4 | 5; fecha: string; texto: string; temas: string[] };

export type ResenasCompetidor = {
  marca: string;
  codigoPais: string;
  producto: string;
  valoracion: number;
  totalResenas: number;
  /** Share of reviews with 5, 4, 3, 2 and 1 stars, in %. */
  distribucion: [number, number, number, number, number];
  resenas: Resena[];
};

export type ResenasEstudio = { temas: TemaResena[]; competidores: ResenasCompetidor[] };

// ---------- Uploaded files ----------

export type HerramientaH10 = "xray" | "cerebro" | "magnet" | "resenas" | "calculadora" | "otro";
export const HERRAMIENTAS_H10: { id: HerramientaH10; nombre: string; ayuda: string }[] = [
  { id: "xray", nombre: "Xray", ayuda: "Mercado de una búsqueda: competidores, precios, ventas" },
  { id: "cerebro", nombre: "Cerebro", ayuda: "Palabras clave de los competidores y sus posiciones" },
  { id: "magnet", nombre: "Magnet", ayuda: "Variantes de la búsqueda con su volumen" },
  { id: "resenas", nombre: "Reseñas", ayuda: "Reseñas de los competidores" },
  { id: "calculadora", nombre: "Calculadora Amazon", ayuda: "Calculadora de beneficios de Amazon con el ASIN cargado" },
  { id: "otro", nombre: "Otro", ayuda: "Cualquier otra captura o archivo" },
];
export const esHerramienta = (v: unknown): v is HerramientaH10 => HERRAMIENTAS_H10.some((h) => h.id === v);

export type ArchivoH10 = {
  id: string;
  nombre: string;
  tipo: string;
  tamano: number;
  subidoEn: string;
  herramienta: HerramientaH10;
  codigoPais: CodigoPais | null;
  /** procesado: its data is in the study · guardado: kept for a later phase · error: couldn't be read. */
  estado: "procesado" | "guardado" | "error";
  /** What was read from it: «Xray · DE · rebounder für fußball · 38 productos». */
  resumen: string;
  error?: string;
};
