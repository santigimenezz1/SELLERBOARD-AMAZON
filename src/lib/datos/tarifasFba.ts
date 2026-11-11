/*
 * Amazon's FBA fulfilment fees in Europe («Tarifa de gestión logística, logística local y paneuropea»), from the rate
 * card in force since 1 February 2026 (page 6), plus the Pan-EU oversize surcharge (page 8). Only the four stores the
 * seller sells in: Spain, Germany and France (stock sent to Germany, Pan-EU) and the UK (stock sent to the UK).
 */

export type PaisTarifa = "ES" | "DE" | "FR" | "UK";
export const PAISES_TARIFA: PaisTarifa[] = ["ES", "DE", "FR", "UK"];
export const NOMBRE_PAIS_TARIFA: Record<PaisTarifa, string> = { ES: "España", DE: "Alemania", FR: "Francia", UK: "Reino Unido" };
export const MONEDA_TARIFA: Record<PaisTarifa, "€" | "£"> = { ES: "€", DE: "€", FR: "€", UK: "£" };
/** Where the stock sold in each store is sent: Germany for the EU (Pan-EU), the UK for the UK. */
export const ENVIO_DESDE: Record<PaisTarifa, string> = { ES: "Alemania", DE: "Alemania", FR: "Alemania", UK: "Reino Unido" };

/** A store's fee: Germany has two, with the Central Europe Programme (stock also in Poland/Czechia) or Germany only. */
type Fila = { UK: number; CEP: number; DE: number; FR: number; ES: number };
const f = (UK: number, CEP: number, DE: number, FR: number, ES: number): Fila => ({ UK, CEP, DE, FR, ES });

export type Tramo = { hasta: number; tarifa: Fila };
export type Categoria = {
  id: string;
  nombre: string;
  /** The tier's size, as the rate card writes it. */
  limites: string;
  /** Longest, median and shortest side allowed (cm); null: no maximum. */
  lados: [number, number, number] | null;
  /** Unit weight allowed (kg): more than `pesoMin`, up to `pesoMax`. */
  pesoMin?: number;
  pesoMax: number;
  /** Dimensional weight allowed (kg); envelopes have none (they go by unit weight). */
  dimMax?: number;
  /** Envelopes go by unit weight; parcels and oversize, by the greater of unit and dimensional weight. */
  porVolumen: boolean;
  tramos: Tramo[];
  /** Oversize: the fee per kg above the last band. */
  porKg?: Fila;
  /** Oversize: the Pan-EU surcharge when sold in a country other than the one the stock was sent to. */
  recargo?: { base: { FR: number; ES: number }; porKg: { FR: number; ES: number } };
};

const t = (hasta: number, tarifa: Fila): Tramo => ({ hasta, tarifa });

export const CATEGORIAS: Categoria[] = [
  {
    id: "sobre-ligero",
    nombre: "Sobre ligero",
    limites: "≤ 33 x 23 x 2,5 cm · ≤ 100 g",
    lados: [33, 23, 2.5],
    pesoMax: 0.1,
    porVolumen: false,
    tramos: [
      t(0.02, f(1.83, 2.07, 2.33, 2.75, 2.77)),
      t(0.04, f(1.87, 2.11, 2.37, 2.76, 2.84)),
      t(0.06, f(1.89, 2.13, 2.39, 2.78, 2.87)),
      t(0.08, f(2.07, 2.26, 2.52, 3.3, 3.21)),
      t(0.1, f(2.08, 2.28, 2.54, 3.32, 3.23)),
    ],
  },
  {
    id: "sobre-estandar",
    nombre: "Sobre estándar",
    limites: "≤ 33 x 23 x 2,5 cm · ≤ 460 g",
    lados: [33, 23, 2.5],
    pesoMax: 0.46,
    porVolumen: false,
    tramos: [t(0.21, f(2.1, 2.31, 2.57, 3.33, 3.26)), t(0.46, f(2.16, 2.42, 2.68, 3.77, 3.45))],
  },
  {
    id: "sobre-grande",
    nombre: "Sobre grande",
    limites: "≤ 33 x 23 x 4 cm · ≤ 960 g",
    lados: [33, 23, 4],
    pesoMax: 0.96,
    porVolumen: false,
    tramos: [t(0.96, f(2.72, 2.78, 3.04, 4.39, 3.6))],
  },
  {
    id: "sobre-extragrande",
    nombre: "Sobre extragrande",
    limites: "≤ 33 x 23 x 6 cm · ≤ 960 g",
    lados: [33, 23, 6],
    pesoMax: 0.96,
    porVolumen: false,
    tramos: [t(0.96, f(2.94, 3.16, 3.42, 4.72, 3.85))],
  },
  {
    id: "paquete-pequeno",
    nombre: "Paquete pequeño",
    limites: "≤ 35 x 25 x 12 cm · peso unitario ≤ 3,90 kg y peso dimensional ≤ 2,10 kg",
    lados: [35, 25, 12],
    pesoMax: 3.9,
    dimMax: 2.1,
    porVolumen: true,
    tramos: [
      t(0.15, f(2.91, 3.12, 3.38, 4.56, 3.52)),
      t(0.4, f(3.0, 3.13, 3.39, 5.07, 3.74)),
      t(0.9, f(3.04, 3.14, 3.4, 5.79, 3.95)),
      t(1.4, f(3.05, 3.15, 3.41, 5.87, 4.21)),
      t(1.9, f(3.25, 3.17, 3.43, 6.1, 4.27)),
      t(3.9, f(3.27, 4.28, 4.54, 7.8, 5.5)),
    ],
  },
  {
    id: "paquete-estandar",
    nombre: "Paquete estándar",
    limites: "≤ 45 x 34 x 26 cm · peso unitario ≤ 11,90 kg y peso dimensional ≤ 7,96 kg",
    lados: [45, 34, 26],
    pesoMax: 11.9,
    dimMax: 7.96,
    porVolumen: true,
    tramos: [
      t(0.15, f(2.94, 3.13, 3.39, 4.58, 3.55)),
      t(0.4, f(3.01, 3.16, 3.42, 5.22, 3.77)),
      t(0.9, f(3.06, 3.18, 3.44, 6.01, 3.99)),
      t(1.4, f(3.26, 3.67, 3.93, 6.41, 4.85)),
      t(1.9, f(3.48, 3.69, 3.95, 6.44, 4.94)),
      t(2.9, f(3.49, 4.29, 4.55, 7.08, 4.98)),
      t(3.9, f(3.54, 4.83, 5.09, 7.81, 5.53)),
      t(5.9, f(3.56, 4.96, 5.22, 8.22, 5.96)),
      t(8.9, f(3.57, 5.77, 6.03, 8.84, 7.24)),
      t(11.9, f(3.58, 6.39, 6.65, 9.38, 7.85)),
    ],
  },
  {
    id: "grande-pequeno",
    nombre: "Tamaño grande (pequeño)",
    limites: "≤ 61 x 46 x 46 cm · peso unitario ≤ 1,76 kg y peso dimensional ≤ 25,82 kg",
    lados: [61, 46, 46],
    pesoMax: 1.76,
    dimMax: 25.82,
    porVolumen: true,
    tramos: [t(0.76, f(3.49, 4.3, 4.56, 7.05, 5.68))],
    porKg: f(0.25, 0.18, 0.18, 0.2, 0.04),
    recargo: { base: { FR: 1.4, ES: 0.77 }, porKg: { FR: 0.07, ES: 0.12 } },
  },
  {
    id: "grande-estandar-ligero",
    nombre: "Tamaño grande (estándar ligero)",
    limites: "≤ 101 x 60 x 60 cm · peso unitario ≤ 15 kg y peso dimensional ≤ 72,72 kg",
    lados: [101, 60, 60],
    pesoMax: 15,
    dimMax: 72.72,
    porVolumen: true,
    tramos: [t(0.76, f(4.35, 4.33, 4.59, 7.29, 6.55))],
    porKg: f(0.15, 0.18, 0.18, 0.21, 0.34),
    recargo: { base: { FR: 1.41, ES: 1.59 }, porKg: { FR: 0.14, ES: 0.12 } },
  },
  {
    id: "grande-estandar-pesado",
    nombre: "Tamaño grande (estándar pesado)",
    limites: "≤ 101 x 60 x 60 cm · peso unitario > 15 kg y ≤ 23 kg y peso dimensional ≤ 72,72 kg",
    lados: [101, 60, 60],
    pesoMin: 15,
    pesoMax: 23,
    dimMax: 72.72,
    porVolumen: true,
    tramos: [t(15.76, f(6.58, 6.99, 7.25, 10.42, 11.72))],
    porKg: f(0.08, 0.07, 0.07, 0.11, 0.27),
    recargo: { base: { FR: 3.02, ES: 2.96 }, porKg: { FR: 0.05, ES: 0.12 } },
  },
  {
    id: "grande-estandar-grande",
    nombre: "Tamaño grande (estándar grande)",
    limites: "≤ 120 x 60 x 60 cm · peso unitario ≤ 23 kg y peso dimensional ≤ 86,40 kg",
    lados: [120, 60, 60],
    pesoMax: 23,
    dimMax: 86.4,
    porVolumen: true,
    tramos: [t(0.76, f(5.67, 5.8, 6.06, 8.47, 6.76))],
    porKg: f(0.07, 0.08, 0.08, 0.13, 0.33),
    recargo: { base: { FR: 2.38, ES: 2.71 }, porKg: { FR: 0.25, ES: 0.25 } },
  },
  {
    id: "grande-voluminoso",
    nombre: "Tamaño grande (voluminoso)",
    limites: "> 120 x 60 x 60 cm · peso unitario ≤ 23 kg y peso dimensional ≤ 126 kg",
    lados: null,
    pesoMax: 23,
    dimMax: 126,
    porVolumen: true,
    tramos: [t(0.76, f(10.2, 7.98, 8.24, 15.38, 9.95))],
    porKg: f(0.24, 0.27, 0.27, 0.45, 0.43),
    recargo: { base: { FR: 3.23, ES: 2.74 }, porKg: { FR: 0.53, ES: 0.61 } },
  },
  {
    id: "grande-pesado",
    nombre: "Tamaño grande (pesado)",
    limites: "peso unitario > 23 kg y ≤ 31,5 kg y peso dimensional ≤ 126 kg",
    lados: null,
    pesoMin: 23,
    pesoMax: 31.5,
    dimMax: 126,
    porVolumen: true,
    tramos: [t(31.5, f(13.04, 12.74, 13.0, 15.59, 14.0))],
    porKg: f(0.09, 0.15, 0.15, 0.18, 0.12),
    recargo: { base: { FR: 3.7, ES: 3.2 }, porKg: { FR: 0.6, ES: 0.45 } },
  },
];

/** Amazon's dimensional weight: length × width × height (cm) ÷ 5000, in kg. */
export const DIVISOR = 5000;

export type Caja = { largo: number; ancho: number; alto: number; pesoG: number };

export type CalculoTarifa = {
  /** The sides from longest to shortest (cm), volume (cm³) and the weights (kg). */
  lados: [number, number, number];
  volumen: number;
  pesoReal: number;
  pesoDim: number;
  /** The weight the fee goes by, and whether it is the dimensional one. */
  pesoEnvio: number;
  ganaDimensional: boolean;
  /** null: «Tamaño grande (especial)», which this page doesn't price (the rate card has its own table). */
  categoria: Categoria | null;
  /** The band of `categoria.tramos` it falls in (oversize: the base band, plus a fee per kg above it). */
  tramo: number;
  /** Each store's fee: the fulfilment fee, the Pan-EU surcharge and the sum. */
  paises: { pais: PaisTarifa; gestion: number; recargo: number; total: number }[];
};

const ordenados = (c: Caja): [number, number, number] => [c.largo, c.ancho, c.alto].sort((a, b) => b - a) as [number, number, number];

/** Whether a box fits a tier: its sides, its unit weight and its dimensional weight. */
function cabe(cat: Categoria, lados: [number, number, number], pesoReal: number, pesoDim: number) {
  if (cat.lados && lados.some((l, i) => l > cat.lados![i])) return false;
  if (pesoReal > cat.pesoMax || (cat.pesoMin !== undefined && pesoReal <= cat.pesoMin)) return false;
  return cat.dimMax === undefined || pesoDim <= cat.dimMax;
}

/** «Tamaño grande (especial)»: over 31,5 kg, a side over 175 cm or a girth (longest + 2 × the other two) over 360 cm. */
const esEspecial = (lados: [number, number, number], pesoReal: number) => pesoReal > 31.5 || lados[0] > 175 || lados[0] + 2 * (lados[1] + lados[2]) > 360;

/** Rounds a fee to cents. */
const centimos = (v: number) => Math.round(v * 100) / 100;

/** The tier, band and fee in each store of a box (its packed weight in grams). `cep`: in the Central Europe Programme. */
export function calcularTarifa(c: Caja, cep: boolean): CalculoTarifa {
  const lados = ordenados(c);
  const volumen = c.largo * c.ancho * c.alto;
  const pesoReal = c.pesoG / 1000;
  const pesoDim = volumen / DIVISOR;
  const categoria = esEspecial(lados, pesoReal) ? null : (CATEGORIAS.find((cat) => cabe(cat, lados, pesoReal, pesoDim)) ?? null);
  const pesoEnvio = categoria && !categoria.porVolumen ? pesoReal : Math.max(pesoReal, pesoDim);
  const ganaDimensional = !!categoria?.porVolumen && pesoDim > pesoReal;
  if (!categoria) return { lados, volumen, pesoReal, pesoDim, pesoEnvio, ganaDimensional, categoria, tramo: -1, paises: [] };
  // Oversize: one base band and a fee for each kg (or part of one) above it.
  const idx = categoria.porKg ? 0 : Math.max(0, categoria.tramos.findIndex((x) => pesoEnvio <= x.hasta + 1e-9));
  const tramo = categoria.tramos[idx];
  const kgDeMas = categoria.porKg ? Math.max(0, Math.ceil(pesoEnvio - tramo.hasta - 1e-9)) : 0;
  const paises = PAISES_TARIFA.map((pais) => {
    const col = pais === "DE" ? (cep ? "CEP" : "DE") : pais;
    const gestion = tramo.tarifa[col] + (categoria.porKg ? categoria.porKg[col] * kgDeMas : 0);
    // Sold in Spain or France with the stock sent to Germany: oversize pays the Pan-EU surcharge.
    const r = categoria.recargo && (pais === "ES" || pais === "FR") ? categoria.recargo.base[pais] + categoria.recargo.porKg[pais] * kgDeMas : 0;
    return { pais, gestion: centimos(gestion), recargo: centimos(r), total: centimos(gestion + r) };
  });
  return { lados, volumen, pesoReal, pesoDim, pesoEnvio, ganaDimensional, categoria, tramo: idx, paises };
}

/**
 * How far the box can grow and stay in the same tier and band: its largest volume and packed weight, and the
 * largest height with the same length and width (cm, to the millimetre). null for oversize (it goes by kg).
 */
export function margenTramo(c: Caja, cep: boolean) {
  const r = calcularTarifa(c, cep);
  if (!r.categoria || r.categoria.porKg) return null;
  const mismo = (x: Caja) => {
    const o = calcularTarifa(x, cep);
    return o.categoria?.id === r.categoria!.id && o.tramo === r.tramo;
  };
  let alto = c.alto;
  while (alto < 300 && mismo({ ...c, alto: Math.round((alto + 0.1) * 10) / 10 })) alto = Math.round((alto + 0.1) * 10) / 10;
  const hasta = r.categoria.tramos[r.tramo].hasta;
  const volumenMax = r.categoria.porVolumen ? Math.floor(Math.min(hasta, r.categoria.dimMax ?? Infinity) * DIVISOR) : null;
  return { altoMax: alto, volumenMax, pesoMaxG: Math.round(Math.min(hasta, r.categoria.pesoMax) * 1000) };
}

/** A fee written as the rate card does: «4,94 €», «3,48 £». */
export const formatTarifa = (v: number, pais: PaisTarifa) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${MONEDA_TARIFA[pais]}`;

/** A band's weight: «≤ 900 g», «≤ 1,4 kg». */
export const formatPesoTramo = (kg: number) => (kg < 1 ? `≤ ${Math.round(kg * 1000)} g` : `≤ ${kg.toLocaleString("es-ES", { maximumFractionDigits: 2 })} kg`);
