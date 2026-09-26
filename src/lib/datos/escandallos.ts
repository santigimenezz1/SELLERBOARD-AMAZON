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
export type Escandallo = { asin: string; proveedores: Proveedor[]; actualizadoEn: string | null };

const g = globalThis as unknown as { __escandallosV2?: Map<string, Escandallo> };
const cache = () => (g.__escandallosV2 ??= new Map());

/** Placeholder costs (made up) for the two football-mat listings, until real ones are entered. */
function ejemploAlfombra(asin: string): Escandallo {
  return {
    asin,
    actualizadoEn: null,
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

export function costeTotal(e: Pick<Escandallo, "proveedores">): number {
  return Math.round(e.proveedores.reduce((s, p) => s + p.piezas.reduce((t, x) => t + x.coste, 0), 0) * 100) / 100;
}

export async function obtenerEscandallo(asin: string): Promise<Escandallo> {
  const enMemoria = cache().get(asin);
  if (enMemoria) return enMemoria;
  const snap = await adminDb().collection("escandallos").doc(asin).get();
  contarLecturas(1);
  const e: Escandallo = snap.exists
    ? { asin, proveedores: (snap.get("proveedores") as Proveedor[]) ?? [], actualizadoEn: (snap.get("actualizadoEn") as string | undefined) ?? null }
    : (EJEMPLOS[asin]?.(asin) ?? { asin, proveedores: [], actualizadoEn: null });
  cache().set(asin, e);
  return e;
}

/** Validates and saves (one write). Throws a Spanish message on bad input. */
export async function guardarEscandallo(asin: string, proveedores: unknown): Promise<Escandallo> {
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
  const e: Escandallo = { asin, proveedores: limpios, actualizadoEn: new Date().toISOString() };
  await adminDb().collection("escandallos").doc(asin).set({ proveedores: limpios, actualizadoEn: e.actualizadoEn });
  contarEscrituras(1);
  cache().set(asin, e);
  return e;
}
