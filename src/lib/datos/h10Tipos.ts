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
  /** Each competitor's Helium 10 «Review Analysis», and the themes the AI put together from all of them. */
  resenasH10?: ResenasCompetidorH10[];
  resenasAgrupadas?: ResenasAgrupadas;
  /** Competitors whose every review was uploaded (Review Downloader CSV): only the counts; the texts load on their page. */
  resenasCompletas?: ResumenResenasCompletas[];
  /** Star-by-star analysis of a whole country («DE»…) or of every country («TODOS»). */
  estrellasAmbito?: Record<string, QuejasPorEstrellas>;
  /** The research agent's report, only when the owner asked for it. */
  informe?: InformeEstrategico;
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

/** One topic of Helium 10's «Review Analysis» of a product: how often its reviews mention it and some snippets. */
export type TemaH10 = {
  tema: string;
  menciones: number;
  /** Its share of the product's topics of the same kind (praise or complaint), in %. */
  porcentaje: number;
  /** Share of the whole category's reviews that mention it, in % (null when not given). */
  categoria: number | null;
  ejemplos: string[];
};

/** Helium 10's «Review Analysis» of one competitor (an Excel per ASIN): its praised and criticised topics. */
export type ResenasH10 = {
  asin: string | null;
  positivos: TemaH10[];
  negativos: TemaH10[];
  /** How much each topic lifts (+) or sinks (−) the product's star rating. */
  impacto: { tema: string; valor: number }[];
};

/** A theme the AI put together from the topics of every competitor and country, in Spanish. */
export type TemaAgrupado = {
  texto: string;
  tipo: "queja" | "elogio";
  /** For complaints: what your product should do about it. */
  mejora: string;
  /** The competitors' topics it gathers: file (archivoId) and the topic as Helium 10 wrote it. */
  fuentes: { archivoId: string; tema: string; tipo: "queja" | "elogio" }[];
};

export type ResenasAgrupadas = { temas: TemaAgrupado[]; generadoEn: string; archivos: string[] };

/** One competitor's review analysis as the page needs it (with its country, brand and file). */
export type ResenasCompetidorH10 = ResenasH10 & { archivoId: string; codigoPais: CodigoPais; marca: string | null; producto: string | null };

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

/** One review as Amazon shows it (Helium 10's «Review Downloader» CSV), in its original language. */
export type ResenaCompleta = {
  fecha: string | null;
  estrellas: 1 | 2 | 3 | 4 | 5;
  titulo: string;
  texto: string;
  verificada: boolean | null;
  variante: string | null;
  autor: string | null;
  util: number | null;
};

/** A competitor whose reviews were all uploaded: how many and how many of each star (index 0 = 1 star). */
export type ResumenResenasCompletas = { archivoId: string; codigoPais: CodigoPais; asin: string | null; total: number; porEstrellas: number[] };

/** What the reviews of each star (1 to 5) of one competitor say (AI): complaints and praise, each with how many reviews say it. */
export type QuejasPorEstrellas = {
  generadoEn: string;
  /** Reviews read (up to a limit per star). */
  analizadas: number;
  /** Per star: reviews there are, how many the AI read (older analyses: all) and what they say. */
  grupos: { estrellas: 1 | 2 | 3 | 4 | 5; total: number; leidas?: number; temas: { texto: string; tipo?: "queja" | "elogio"; resenas: number; ejemplo: string | null }[] }[];
};

// ---------- Strategic report (research agent) ----------

/** Where a claim comes from: a figure of the study, a web page (its number in «fuentes») or the agent's own guess. */
export type PruebaInforme = { tipo: "dato" | "web" | "supuesto"; texto: string; fuente?: number };

/** One block of a report section. Texts may carry **bold**. */
export type BloqueInforme =
  | { tipo: "cifras"; items: { valor: string; etiqueta: string }[] }
  | { tipo: "texto"; texto: string }
  | { tipo: "destacado"; etiqueta: string; texto: string }
  | { tipo: "cita"; texto: string; nota?: string }
  | { tipo: "lista"; items: { titulo: string; texto: string; prueba?: PruebaInforme }[] }
  | { tipo: "despiece"; piezas: { nombre: string; detalle: string; estado: "consumible" | "incluido" | "estructura" | "anadido" }[] }
  | { tipo: "colores"; items: { nombre: string; hex: string; nota: string; estado: "bien" | "regular" | "mal" }[]; texto?: string }
  | { tipo: "pasos"; items: { titulo: string; texto: string }[] }
  /** Keywords for PPC: whether to bid on each and why (amounts in the marketplace currency). */
  | {
      tipo: "palabras";
      moneda: "EUR" | "GBP";
      items: {
        texto: string;
        busquedas: number;
        puja: number | null;
        /** Titles of the first page that carry it. */
        densidad: number;
        /** Sales needed in 8 days to rank on page 1 (Helium 10's CPR). */
        cpr: number;
        veredicto: "atacar" | "probar" | "evitar";
        concordancia: "exacta" | "frase" | "amplia" | null;
        motivo: string;
      }[];
    }
  | { tipo: "etiquetas"; titulo: string; tono: "bien" | "mal"; items: string[]; prueba?: PruebaInforme };

export type SeccionInforme = { id: string; etiqueta: string; titulo: string; bloques: BloqueInforme[] };

/** The research agent's report on a niche: what to make, how to sell it and what to ask the factory. */
export type InformeEstrategico = {
  generadoEn: string;
  /** True while it's a mock-up (no agent behind it yet). */
  simulado: boolean;
  antetitulo: string;
  titular: string;
  /** The title's last words, highlighted. */
  titularDestacado: string;
  resumen: string;
  veredicto: "lanzar" | "validar" | "descartar";
  secciones: SeccionInforme[];
  fuentes: { n: number; titulo: string; url: string }[];
  /** Minutes and dollars the agent took (estimated while simulated). */
  coste: { minutos: number; dolares: number };
  /** How the team worked on it (reports made by the team). */
  trabajo?: TrabajoEquipo;
};

/** One step of the research team: who did it, when and what. */
/** «consulta»: «quien» asks «para» something; «respuesta»: «quien» answers «para». */
export type PasoEquipo = { hora: string; texto: string; tipo: "inicio" | "estudio" | "web" | "informe" | "aviso" | "consulta" | "respuesta"; quien?: string; para?: string };

/** How the team worked on a report: every step, each specialist's analysis and what it cost. */
export type TrabajoEquipo = {
  modo: "ensayo" | "real";
  empezado: string;
  terminado: string;
  pasos: PasoEquipo[];
  analisis: { especialista: string; analisis: string; fuentes: { titulo: string; url: string }[] }[];
  gasto: { modelo: string; entrada: number; salida: number; cacheEscrita: number; cacheLeida: number; busquedasWeb: number; dolares: number };
};
