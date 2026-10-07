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
  /** Competitors read straight from Amazon (any ASIN, per country), with their daily follow-up. */
  amazon?: SeguimientoAmazon[];
  /** ASINs added by hand to the Amazon follow-up (they're fetched in every country). */
  asinsManuales?: string[];
  /** Monthly searches of each country's keyword over the last years (Helium 10's «Search Volume» chart). */
  busquedas?: Partial<Record<CodigoPais, HistorialBusquedas>>;
  /** Older Xrays of each country (without their competitors): more months to work out revenue per search. */
  xraysAnteriores?: Partial<Record<CodigoPais, MercadoXray[]>>;
  /** A built-in sample study (not stored, can't be changed). */
  ejemplo?: boolean;
};

/** A keyword's searches month by month, read from Helium 10's «Search Volume» chart (3 or 5 years). */
export type HistorialBusquedas = {
  codigoPais: CodigoPais;
  palabraClave: string;
  /** Oldest first; `mes` is YYYY-MM. */
  meses: { mes: string; busquedas: number }[];
  /** The chart's weekly points (YYYY-MM-DD), when it came as CSV: they match an Xray's exact 30 days. */
  semanas?: { dia: string; busquedas: number }[];
  fecha: string;
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
  /** Your product's box, in cm and kg: picks the competitor whose FBA fee is like yours. */
  miCaja?: Paquete;
};

// ---------- Competitors read from Amazon ----------

export type Paquete = { largo: number; ancho: number; alto: number; peso: number };

/** One competitor ASIN in one country, as Amazon gives it (amounts in the marketplace currency). */
export type FichaAmazon = {
  asin: string;
  codigoPais: CodigoPais;
  moneda: "EUR" | "GBP";
  titulo: string | null;
  marca: string | null;
  paquete: Paquete | null;
  rankings: { rank: number; categoria: string }[];
  /** Featured-offer price (or the lowest), and how many sellers offer it. */
  precio: number | null;
  ofertas: number | null;
  destacadaFba: boolean | null;
  /** Amazon's fee estimate at `precioTarifas` (FBA, stock in that country). */
  comision: number | null;
  tarifaFba: number | null;
  precioTarifas: number | null;
  tarifasEn: string | null;
  actualizadoEn: string;
  /** Not sold in that country, or Amazon didn't answer. */
  error?: string;
};

/** A day of the follow-up: price, sellers and main sales rank. */
export type PuntoSeguimiento = { dia: string; precio: number | null; ofertas: number | null; rank: number | null };

export type SeguimientoAmazon = { ficha: FichaAmazon; puntos: PuntoSeguimiento[] };

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

/** What a file is: a Helium 10 tool, an Amazon page or one of the owner's own documents. */
export type HerramientaH10 =
  | "xray"
  | "cerebro"
  | "magnet"
  | "resenas"
  | "historial"
  | "busquedas"
  | "calculadora"
  | "ficha"
  | "restricciones"
  | "proveedor"
  | "envio"
  | "medidas"
  | "certificados"
  | "otro";
export const HERRAMIENTAS_H10: { id: HerramientaH10; nombre: string; ayuda: string }[] = [
  { id: "xray", nombre: "Xray", ayuda: "Helium 10: mercado de una búsqueda (competidores, precios, ventas)" },
  { id: "cerebro", nombre: "Cerebro", ayuda: "Helium 10: palabras clave de los competidores y sus posiciones" },
  { id: "magnet", nombre: "Magnet", ayuda: "Helium 10: variantes de la búsqueda con su volumen" },
  { id: "resenas", nombre: "Reseñas", ayuda: "Reseñas de los competidores (Helium 10 o capturas de Amazon)" },
  { id: "historial", nombre: "Historial de ventas", ayuda: "Helium 10: gráficas de ventas, precio y BSR de 12 meses" },
  { id: "busquedas", nombre: "Historial de búsquedas", ayuda: "Helium 10: gráfico «Search Volume» de la palabra clave, de 3 o 5 años" },
  { id: "calculadora", nombre: "Calculadora Amazon", ayuda: "Calculadora de ingresos de Amazon con el ASIN del competidor cargado" },
  { id: "ficha", nombre: "Ficha de competidor", ayuda: "Captura de la página de un competidor en Amazon (fotos, título, viñetas)" },
  { id: "restricciones", nombre: "Restricciones de categoría", ayuda: "Seller Central → Añadir un producto: si la categoría pide aprobación" },
  { id: "proveedor", nombre: "Presupuesto del proveedor", ayuda: "Precio por unidad y cantidad mínima (Alibaba, proforma…)" },
  { id: "envio", nombre: "Envío y aduana", ayuda: "Presupuesto del transitario: transporte hasta Amazon y aranceles" },
  { id: "medidas", nombre: "Medidas y peso", ayuda: "Medidas y peso de la caja de tu producto (ficha del proveedor)" },
  { id: "certificados", nombre: "Certificados", ayuda: "CE, EN 71 (juguetes)… del proveedor" },
  { id: "otro", nombre: "Otro", ayuda: "Cualquier otro archivo" },
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
  /** Xray only: the keyword it analyses (to tell the main search from the secondary ones). */
  palabraClave?: string;
  error?: string;
};
