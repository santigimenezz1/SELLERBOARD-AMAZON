import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { buscarCatalogo, ofertasCompetidor, type ItemCatalogoCompleto } from "@/lib/amazon/apis";
import { contarEscrituras, contarLecturas } from "./consumo";
import type { CodigoPais } from "./h10Tipos";

/*
 * «Calculadora»: Amazon's revenue calculator, rebuilt. A product of the catalog (by ASIN, EAN/UPC or words) with what
 * the calculator shows of it, and the settings Amazon's fees API doesn't give: the storage rate per cubic metre of each
 * country and season, and the digital services tax on the referral fee. One doc, `config/calculadora`.
 */

export const MERCADOS_CALC: Record<CodigoPais, { id: string; moneda: "EUR" | "GBP" }> = {
  ES: { id: "A1RKKUPIHCS9HS", moneda: "EUR" },
  DE: { id: "A1PA6795UKMFR9", moneda: "EUR" },
  FR: { id: "A13V1IB3VIYZZH", moneda: "EUR" },
  IT: { id: "APJ6JRA9NG5V4", moneda: "EUR" },
  GB: { id: "A1F83G8C2ARO7P", moneda: "GBP" },
};

/** A product as the calculator shows it. Size and weight are the package's (what FBA charges for). */
export type ProductoCalc = {
  asin: string;
  titulo: string;
  marca: string | null;
  imagen: string | null;
  pesoKg: number | null;
  /** Package length × width × height in cm. */
  medidasCm: [number, number, number] | null;
  rank: { posicion: number; categoria: string } | null;
};
/** The featured offer of a product: price (shipping included), how many offers, whether Amazon ships it. */
export type OfertaCalc = { precio: number | null; moneda: string; ofertas: number | null; envioAmazon: boolean | null };

/**
 * What Amazon's fees API doesn't give. Storage: money per m³ a month, Jan–Sep («baja») and Oct–Dec («alta»), in the
 * country's currency. Digital services: % charged on the referral fee.
 */
export type AjustesCalc = { almacenamiento: Record<CodigoPais, { baja: number; alta: number }>; serviciosDigitales: Record<CodigoPais, number> };

/**
 * Storage calibrated with Amazon's own calculator (ES, Jan–Sep: 0,56 € for a 0,0075 m³ package = 74,67 €/m³); the
 * Oct–Dec rate keeps the ratio of Amazon's published table (52,20 / 27,54). The UK, Amazon's published £ per ft³ in
 * £ per m³: to calibrate. Digital services: Spain, France and Italy 3 %, the UK 2 %, Germany none.
 */
export const AJUSTES_INICIALES: AjustesCalc = {
  almacenamiento: {
    ES: { baja: 74.67, alta: 141.53 },
    DE: { baja: 74.67, alta: 141.53 },
    FR: { baja: 74.67, alta: 141.53 },
    IT: { baja: 74.67, alta: 141.53 },
    GB: { baja: 26.84, alta: 53.33 },
  },
  serviciosDigitales: { ES: 3, DE: 0, FR: 3, IT: 3, GB: 2 },
};

const g = globalThis as unknown as { __ajustesCalc?: AjustesCalc };
const ref = () => adminDb().collection("config").doc("calculadora");

export async function leerAjustesCalc(): Promise<AjustesCalc> {
  if (g.__ajustesCalc) return g.__ajustesCalc;
  const snap = await ref().get();
  contarLecturas(1);
  const d = snap.data() as Partial<AjustesCalc> | undefined;
  g.__ajustesCalc = {
    almacenamiento: { ...AJUSTES_INICIALES.almacenamiento, ...d?.almacenamiento },
    serviciosDigitales: { ...AJUSTES_INICIALES.serviciosDigitales, ...d?.serviciosDigitales },
  };
  return g.__ajustesCalc;
}

/** Saves the settings as sent (each figure checked: 0–1.000 per m³, 0–20 %). */
export async function guardarAjustesCalc(v: unknown): Promise<AjustesCalc> {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof AjustesCalc, Record<string, unknown>>>;
  const cifra = (x: unknown, max: number, porDefecto: number) => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= max ? Math.round(x * 100) / 100 : porDefecto);
  const actual = await leerAjustesCalc();
  const paises = Object.keys(AJUSTES_INICIALES.almacenamiento) as CodigoPais[];
  const nuevo: AjustesCalc = {
    almacenamiento: Object.fromEntries(
      paises.map((p) => {
        const a = (o.almacenamiento?.[p] ?? {}) as { baja?: unknown; alta?: unknown };
        return [p, { baja: cifra(a.baja, 1000, actual.almacenamiento[p].baja), alta: cifra(a.alta, 1000, actual.almacenamiento[p].alta) }];
      }),
    ) as AjustesCalc["almacenamiento"],
    serviciosDigitales: Object.fromEntries(paises.map((p) => [p, cifra(o.serviciosDigitales?.[p], 20, actual.serviciosDigitales[p])])) as AjustesCalc["serviciosDigitales"],
  };
  await ref().set(nuevo);
  contarEscrituras(1);
  g.__ajustesCalc = nuevo;
  return nuevo;
}

type Medida = { unit?: string; value?: number };
const aCm = (m: Medida | undefined) => (m?.value === undefined ? null : m.unit?.startsWith("inch") ? m.value * 2.54 : m.unit?.startsWith("milli") ? m.value / 10 : m.value);
const aKg = (m: Medida | undefined) =>
  m?.value === undefined ? null : m.unit?.startsWith("pound") ? m.value * 0.45359237 : m.unit?.startsWith("gram") ? m.value / 1000 : m.unit?.startsWith("ounce") ? m.value * 0.0283495 : m.value;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A catalog item as the calculator shows it: the package's size and weight as the seller declared them, else Amazon's. */
function producto(it: ItemCatalogoCompleto, marketplaceId: string): ProductoCalc {
  const at = (it.attributes ?? {}) as Record<string, Record<string, unknown>[]>;
  const dimAttr = at.item_package_dimensions?.[0] as { length?: Medida; width?: Medida; height?: Medida } | undefined;
  const pesoAttr = at.item_package_weight?.[0] as Medida | undefined;
  const pkg = it.dimensions?.find((d) => d.marketplaceId === marketplaceId) as { package?: { length?: Medida; width?: Medida; height?: Medida; weight?: Medida } } | undefined;
  const medidas = [dimAttr?.length ?? pkg?.package?.length, dimAttr?.width ?? pkg?.package?.width, dimAttr?.height ?? pkg?.package?.height].map(aCm);
  const peso = aKg(pesoAttr ?? pkg?.package?.weight);
  const s = it.summaries?.find((x) => x.marketplaceId === marketplaceId) ?? it.summaries?.[0];
  const foto = it.images?.find((x) => x.marketplaceId === marketplaceId)?.images ?? it.images?.[0]?.images;
  const rank = it.salesRanks?.find((x) => x.marketplaceId === marketplaceId)?.displayGroupRanks?.[0];
  return {
    asin: it.asin,
    titulo: s?.itemName ?? it.asin,
    marca: s?.brand ?? null,
    imagen: foto?.filter((i) => i.variant === "MAIN").sort((a, b) => b.width - a.width)[0]?.link ?? null,
    pesoKg: peso === null ? null : r2(peso),
    medidasCm: medidas.every((m): m is number => m !== null) ? (medidas.map(r2) as [number, number, number]) : null,
    rank: rank ? { posicion: rank.rank, categoria: rank.title } : null,
  };
}

/** Products of the catalog by ASIN, EAN/UPC or words, in a country (up to 10). */
export async function buscarProductos(pais: CodigoPais, texto: string): Promise<ProductoCalc[]> {
  const id = MERCADOS_CALC[pais].id;
  return (await buscarCatalogo(texto, id)).map((it) => producto(it, id));
}

/** The featured offer of an ASIN in a country. */
export async function ofertaDe(pais: CodigoPais, asin: string): Promise<OfertaCalc> {
  const o = await ofertasCompetidor(asin, MERCADOS_CALC[pais].id);
  return { precio: o.precio, moneda: o.moneda ?? MERCADOS_CALC[pais].moneda, ofertas: o.ofertas, envioAmazon: o.destacadaFba };
}
