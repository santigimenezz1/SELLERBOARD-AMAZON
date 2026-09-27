import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * Supplier contact book. Keyed by supplier name (as written in a product's
 * cost breakdown), so a supplier shared by several products — the old and new
 * football-mat listings — is entered once. One doc per supplier in
 * `proveedores`, all cached in memory after the first read.
 */

export type ContactoProveedor = {
  id: string;
  nombre: string;
  empresa: string;
  telefono: string;
  email: string;
  alibaba: string;
  /** null = made-up example, not saved yet. */
  actualizadoEn: string | null;
};

/** "Proveedor alfombras" → "proveedor-alfombras" (doc id). */
export function idProveedor(nombre: string): string {
  return (
    nombre
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "proveedor"
  );
}

// Made-up placeholders so the layout can be judged; replaced when real data is saved.
const EJEMPLOS: Record<string, Omit<ContactoProveedor, "id" | "nombre" | "actualizadoEn">> = {
  "proveedor-alfombras": {
    empresa: "Ejemplo Sporting Goods Co., Ltd.",
    telefono: "+86 574 8765 4321",
    email: "ventas@ejemplo-sporting.example",
    alibaba: "https://ejemplo-sporting.en.alibaba.com",
  },
  "proveedor-cajas": {
    empresa: "Ejemplo Packaging Co., Ltd.",
    telefono: "+86 755 1234 5678",
    email: "info@ejemplo-packaging.example",
    alibaba: "https://ejemplo-packaging.en.alibaba.com",
  },
};

const g = globalThis as unknown as { __proveedores?: Map<string, ContactoProveedor> };

async function todos(): Promise<Map<string, ContactoProveedor>> {
  if (g.__proveedores) return g.__proveedores;
  const snap = await adminDb().collection("proveedores").get();
  contarLecturas(snap.size);
  g.__proveedores = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...(d.data() as Omit<ContactoProveedor, "id">) }]));
  return g.__proveedores;
}

/** Contact cards for these supplier names (saved data, else the example, else empty fields). */
export async function contactosDe(nombres: string[]): Promise<ContactoProveedor[]> {
  const guardados = await todos();
  return nombres.map((nombre) => {
    const id = idProveedor(nombre);
    const g = guardados.get(id);
    if (g) return { ...g, nombre };
    const ejemplo = EJEMPLOS[id];
    return { id, nombre, empresa: ejemplo?.empresa ?? "", telefono: ejemplo?.telefono ?? "", email: ejemplo?.email ?? "", alibaba: ejemplo?.alibaba ?? "", actualizadoEn: null };
  });
}

const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/** Validates and saves one supplier's contact (one write). Throws a Spanish message on bad input. */
export async function guardarContacto(datos: Record<string, unknown>): Promise<ContactoProveedor> {
  const nombre = texto(datos.nombre, 80);
  if (!nombre) throw new Error("Falta el nombre del proveedor");
  const email = texto(datos.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("El correo no parece válido");
  let alibaba = texto(datos.alibaba, 300);
  if (alibaba && !/^https?:\/\//i.test(alibaba)) alibaba = `https://${alibaba}`;
  if (alibaba) {
    try {
      new URL(alibaba);
    } catch {
      throw new Error("El enlace de Alibaba no es válido");
    }
  }
  const c: ContactoProveedor = {
    id: idProveedor(nombre),
    nombre,
    empresa: texto(datos.empresa, 120),
    telefono: texto(datos.telefono, 40),
    email,
    alibaba,
    actualizadoEn: new Date().toISOString(),
  };
  const { id, ...doc } = c;
  await adminDb().collection("proveedores").doc(id).set(doc);
  contarEscrituras(1);
  (await todos()).set(id, c);
  return c;
}
