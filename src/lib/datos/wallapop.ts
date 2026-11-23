import "server-only";

import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { bucket } from "./documentos";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * «Wallapop»: the images of second-hand sales to hand over (Vinted, Wallapop or Correos), one card each.
 *
 * - Files live in Firebase Storage under `wallapop/{id}/{file name}`, private: shown through a signed link that
 *   lasts a few minutes, created for a logged-in user.
 * - The list is one doc, `config/wallapop`, kept in memory (one read per server start, one write per change).
 */

export const TIPOS_ENVIO = ["vinted", "wallapop", "correos", "inpost"] as const;
export type TipoEnvio = (typeof TIPOS_ENVIO)[number];
export const esTipoEnvio = (v: unknown): v is TipoEnvio => TIPOS_ENVIO.includes(v as TipoEnvio);

export type EnvioWallapop = {
  id: string;
  tipo: TipoEnvio;
  /** Name shown on the card (the file name unless changed). */
  nombre: string;
  /** Which product it is (typed by the user, editable). */
  producto?: string;
  archivo: string;
  contentType: string;
  tamano: number;
  subidoEn: string;
  /** When it was handed over; null while pending. */
  entregadoEn: string | null;
};

export const TAMANO_MAXIMO_WALLAPOP = 15 * 1024 * 1024;

const g = globalThis as unknown as { __wallapop?: EnvioWallapop[] };
const ref = () => adminDb().collection("config").doc("wallapop");
const ruta = (e: Pick<EnvioWallapop, "id" | "archivo">) => `wallapop/${e.id}/${e.archivo}`;
const nombreArchivo = (n: string) => n.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(-120) || "imagen";

export async function listarEnviosWallapop(): Promise<EnvioWallapop[]> {
  if (g.__wallapop) return g.__wallapop;
  const snap = await ref().get();
  contarLecturas(1);
  g.__wallapop = (snap.get("lista") as EnvioWallapop[] | undefined) ?? [];
  return g.__wallapop;
}

async function guardar(lista: EnvioWallapop[]) {
  await ref().set({ lista, actualizadoEn: new Date().toISOString() });
  contarEscrituras(1);
  g.__wallapop = lista;
}

export async function subirEnvioWallapop(archivo: File, tipo: unknown, producto?: unknown): Promise<EnvioWallapop> {
  if (!esTipoEnvio(tipo)) throw new Error("Elige Vinted, Wallapop, Correos o InPost");
  if (archivo.size === 0) throw new Error("El archivo está vacío");
  if (archivo.size > TAMANO_MAXIMO_WALLAPOP) throw new Error("El archivo pasa de 15 MB");
  const contentType = archivo.type || "application/octet-stream";
  if (!contentType.startsWith("image/") && contentType !== "application/pdf") throw new Error("Solo imágenes o PDF");
  const envio: EnvioWallapop = {
    id: randomUUID(),
    tipo,
    nombre: archivo.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Envío",
    producto: typeof producto === "string" ? producto.trim().slice(0, 200) : "",
    archivo: nombreArchivo(archivo.name),
    contentType,
    tamano: archivo.size,
    subidoEn: new Date().toISOString(),
    entregadoEn: null,
  };
  try {
    await bucket()
      .file(ruta(envio))
      .save(Buffer.from(await archivo.arrayBuffer()), { contentType, resumable: false });
  } catch (e) {
    if (e instanceof Error && /bucket does not exist/i.test(e.message)) throw new Error("Falta activar Storage en la consola de Firebase (Storage → Comenzar)");
    throw e;
  }
  await guardar([envio, ...(await listarEnviosWallapop())]);
  return envio;
}

/** Marks it handed over (`entregado`) or back to pending; can also change its type or name. */
export async function editarEnvioWallapop(id: string, cambios: { entregado?: unknown; tipo?: unknown; nombre?: unknown; producto?: unknown }): Promise<EnvioWallapop> {
  const lista = await listarEnviosWallapop();
  const actual = lista.find((e) => e.id === id);
  if (!actual) throw new Error("Envío no encontrado");
  const nombre = typeof cambios.nombre === "string" ? cambios.nombre.trim().slice(0, 120) : "";
  const nuevo: EnvioWallapop = {
    ...actual,
    tipo: esTipoEnvio(cambios.tipo) ? cambios.tipo : actual.tipo,
    nombre: nombre || actual.nombre,
    producto: typeof cambios.producto === "string" ? cambios.producto.trim().slice(0, 200) : (actual.producto ?? ""),
    entregadoEn: typeof cambios.entregado === "boolean" ? (cambios.entregado ? (actual.entregadoEn ?? new Date().toISOString()) : null) : actual.entregadoEn,
  };
  await guardar(lista.map((e) => (e.id === id ? nuevo : e)));
  return nuevo;
}

export async function borrarEnvioWallapop(id: string): Promise<void> {
  const lista = await listarEnviosWallapop();
  const e = lista.find((x) => x.id === id);
  if (!e) return;
  await bucket().file(ruta(e)).delete({ ignoreNotFound: true });
  await guardar(lista.filter((x) => x.id !== id));
}

/** The file itself (served from this site, so the browser can draw a PDF without cross-site limits). */
export async function bytesEnvioWallapop(id: string): Promise<{ datos: Buffer; contentType: string }> {
  const e = (await listarEnviosWallapop()).find((x) => x.id === id);
  if (!e) throw new Error("Envío no encontrado");
  const [datos] = await bucket().file(ruta(e)).download();
  return { datos, contentType: e.contentType };
}

/** A link to the image valid for 10 minutes. */
export async function enlaceEnvioWallapop(id: string): Promise<string> {
  const e = (await listarEnviosWallapop()).find((x) => x.id === id);
  if (!e) throw new Error("Envío no encontrado");
  const [url] = await bucket()
    .file(ruta(e))
    .getSignedUrl({ action: "read", expires: Date.now() + 10 * 60_000, responseDisposition: `inline; filename="${e.archivo}"`, responseType: e.contentType });
  return url;
}
