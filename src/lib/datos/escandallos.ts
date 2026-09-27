import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * Cost breakdown ("escandallo") of a product: what each piece costs, grouped
 * by supplier, and the total unit cost. One doc per ASIN in `escandallos`,
 * cached in memory (a product page reads it once per server process).
 */

export type Pieza = { id: string; nombre: string; coste: number };
export type Proveedor = { id: string; nombre: string; piezas: Pieza[] };
/**
 * Costs paid per batch rather than per piece: the quality inspection and the AGL (Amazon Global Logistics)
 * freight of the last shipment. Per-unit cost = costeTotal / unidades.
 */
export type TipoLote = "inspeccion" | "agl";
export type Lote = { id: TipoLote; referencia: string; fecha: string; unidades: number; costeTotal: number };

export type Escandallo = {
  asin: string;
  proveedores: Proveedor[];
  lotes: Lote[];
  /** The batches still hold the made-up example values (never saved). */
  lotesEjemplo: boolean;
  actualizadoEn: string | null;
};

export const TIPOS_LOTE: TipoLote[] = ["inspeccion", "agl"];
const loteVacio = (id: TipoLote): Lote => ({ id, referencia: "", fecha: "", unidades: 0, costeTotal: 0 });
export const costePorUnidad = (l: Lote) => (l.unidades > 0 ? l.costeTotal / l.unidades : 0);

/** Placeholder batches (made up) for the two football-mat listings. */
const LOTES_EJEMPLO: Lote[] = [
  { id: "inspeccion", referencia: "Inspección QC antes del embarque", fecha: "2026-08-12", unidades: 3000, costeTotal: 180 },
  { id: "agl", referencia: "FBA15EJEMPLO1", fecha: "2026-08-24", unidades: 2400, costeTotal: 1560 },
];

const g = globalThis as unknown as { __escandallosV3?: Map<string, Escandallo> };
const cache = () => (g.__escandallosV3 ??= new Map());

/** Placeholder costs (made up) for the two football-mat listings, until real ones are entered. */
function ejemploAlfombra(asin: string): Escandallo {
  return {
    asin,
    actualizadoEn: null,
    lotes: LOTES_EJEMPLO,
    lotesEjemplo: true,
    proveedores: [
      {
        id: "p1",
        nombre: "Proveedor alfombras",
        // One unified cost: this supplier sells the mat, socks and carry bag as a single set.
        piezas: [{ id: "p1a", nombre: "Alfombra + calcetines + bolsa de transporte", coste: 5.65 }],
      },
      { id: "p2", nombre: "Proveedor cajas", piezas: [{ id: "p2a", nombre: "Caja premium", coste: 1.1 }] },
    ],
  };
}
const EJEMPLOS: Record<string, (asin: string) => Escandallo> = {
  B0FMPLCLQ9: ejemploAlfombra, // listing viejo
  B0GCTT9X6J: ejemploAlfombra, // listing nuevo
};

export function costeTotal(e: Pick<Escandallo, "proveedores" | "lotes">): number {
  const piezas = e.proveedores.reduce((s, p) => s + p.piezas.reduce((t, x) => t + x.coste, 0), 0);
  const lotes = e.lotes.reduce((s, l) => s + costePorUnidad(l), 0);
  return Math.round((piezas + lotes) * 100) / 100;
}

export async function obtenerEscandallo(asin: string): Promise<Escandallo> {
  const enMemoria = cache().get(asin);
  if (enMemoria) return enMemoria;
  const snap = await adminDb().collection("escandallos").doc(asin).get();
  contarLecturas(1);
  const ejemplo = EJEMPLOS[asin]?.(asin);
  let e: Escandallo;
  if (snap.exists) {
    const lotes = snap.get("lotes") as Lote[] | undefined;
    e = {
      asin,
      proveedores: (snap.get("proveedores") as Proveedor[]) ?? [],
      // Saved before batches existed: show the example ones (if any) until saved again.
      lotes: lotes ?? ejemplo?.lotes ?? TIPOS_LOTE.map(loteVacio),
      lotesEjemplo: !lotes && !!ejemplo,
      actualizadoEn: (snap.get("actualizadoEn") as string | undefined) ?? null,
    };
  } else {
    e = ejemplo ?? { asin, proveedores: [], lotes: TIPOS_LOTE.map(loteVacio), lotesEjemplo: false, actualizadoEn: null };
  }
  cache().set(asin, e);
  return e;
}

/** Validates and saves (one write). Throws a Spanish message on bad input. */
export async function guardarEscandallo(asin: string, proveedores: unknown, lotesEntrada: unknown): Promise<Escandallo> {
  if (!Array.isArray(proveedores) || proveedores.length > 20) throw new Error("Datos no válidos");
  const limpios: Proveedor[] = proveedores.map((p, i) => {
    const pr = p as Partial<Proveedor>;
    if (!Array.isArray(pr.piezas) || pr.piezas.length > 50) throw new Error("Datos no válidos");
    return {
      id: String(pr.id ?? `p${i}`).slice(0, 40),
      nombre: String(pr.nombre ?? "").trim().slice(0, 80) || `Proveedor ${i + 1}`,
      piezas: pr.piezas.map((x, j) => {
        const coste = Number((x as Partial<Pieza>).coste);
        if (!Number.isFinite(coste) || coste < 0 || coste > 100_000) throw new Error("Los costes deben ser números positivos");
        return {
          id: String((x as Partial<Pieza>).id ?? `${i}-${j}`).slice(0, 40),
          nombre: String((x as Partial<Pieza>).nombre ?? "").trim().slice(0, 80) || `Pieza ${j + 1}`,
          coste: Math.round(coste * 10000) / 10000,
        };
      }),
    };
  });
  const recibidos = Array.isArray(lotesEntrada) ? (lotesEntrada as Partial<Lote>[]) : [];
  const lotes: Lote[] = TIPOS_LOTE.map((id) => {
    const l = recibidos.find((x) => x?.id === id);
    if (!l) return loteVacio(id);
    const unidades = Math.round(Number(l.unidades));
    const costeTotalLote = Number(l.costeTotal);
    if (!Number.isFinite(unidades) || unidades < 0 || unidades > 10_000_000) throw new Error("Las unidades deben ser un número positivo");
    if (!Number.isFinite(costeTotalLote) || costeTotalLote < 0 || costeTotalLote > 10_000_000) throw new Error("Los costes deben ser números positivos");
    const fecha = String(l.fecha ?? "");
    return { id, referencia: String(l.referencia ?? "").trim().slice(0, 80), fecha: /^d{4}-d{2}-d{2}$/.test(fecha) ? fecha : "", unidades, costeTotal: Math.round(costeTotalLote * 100) / 100 };
  });
  const e: Escandallo = { asin, proveedores: limpios, lotes, lotesEjemplo: false, actualizadoEn: new Date().toISOString() };
  await adminDb().collection("escandallos").doc(asin).set({ proveedores: limpios, lotes, actualizadoEn: e.actualizadoEn });
  contarEscrituras(1);
  cache().set(asin, e);
  return e;
}
