import "server-only";

import { randomUUID } from "node:crypto";
import { getStorage } from "firebase-admin/storage";
import { adminDb } from "@/lib/firebase/admin";
import { limpiarEnv } from "@/lib/env";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * The company's documents (PDFs and the like), filed in folders.
 *
 * - Files live in Firebase Storage under `documentos/{id}/{file name}`, private: they're only served through a
 *   signed link that lasts a few minutes, created for a logged-in user.
 * - The list (name, folder, date, note…) and the folders (the user adds, renames and deletes them) are one doc,
 *   `config/documentos`, kept in memory.
 */

export type Carpeta = { id: string; nombre: string; color: string };

export type Documento = {
  id: string;
  nombre: string;
  /** Id of its folder. */
  carpeta: string;
  /** Date of the document itself ("YYYY-MM-DD"), if given. */
  fecha: string | null;
  nota: string;
  /** Heading the document is filed under inside its folder («Declaraciones IVA 2026»…); "" = none. */
  titulo?: string;
  archivo: string;
  tipo: string;
  tamano: number;
  subidoEn: string;
};

export const TAMANO_MAXIMO = 25 * 1024 * 1024;

// Folder colors, handed out in turn to new folders.
const COLORES = ["#2c90b6", "#e0a526", "#e07b4f", "#3fb68b", "#8b7cf6", "#6f8fd8", "#e879a6", "#5fb3a1", "#d65c5c", "#c58b4a", "#8a8f98"];

/** The folders a new archive starts with. */
const CARPETAS_INICIALES: Carpeta[] = [
  "Constitución y escrituras",
  "Impuestos / Avask",
  "Amazon",
  "Proveedores y facturas",
  "Bancos",
  "Transporte / AGL",
  "Marcas y certificados",
  "Otros",
].map((nombre, i) => ({ id: `c${i + 1}`, nombre, color: COLORES[i % COLORES.length] }));

type Archivo = { lista: Documento[]; carpetas: Carpeta[] };
const g = globalThis as unknown as { __documentosV2?: Archivo };
const ref = () => adminDb().collection("config").doc("documentos");
/** The Firebase Storage bucket (also holds the purchase tickets). */
export const bucket = () => {
  const nombre = limpiarEnv(process.env.FIREBASE_STORAGE_BUCKET) || `${limpiarEnv(process.env.FIREBASE_ADMIN_PROJECT_ID)}.firebasestorage.app`;
  adminDb(); // makes sure the admin app is initialised
  return getStorage().bucket(nombre);
};
const ruta = (d: Pick<Documento, "id" | "archivo">) => `documentos/${d.id}/${d.archivo}`;

const esFecha = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
/** A file name safe for a storage path and a download header. */
const nombreArchivo = (n: string) => n.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(-120) || "documento";

async function leer(): Promise<Archivo> {
  if (g.__documentosV2) return g.__documentosV2;
  const snap = await ref().get();
  contarLecturas(1);
  g.__documentosV2 = { lista: (snap.get("lista") as Documento[] | undefined) ?? [], carpetas: (snap.get("carpetas") as Carpeta[] | undefined) ?? CARPETAS_INICIALES };
  return g.__documentosV2;
}

export async function listarDocumentos(): Promise<Documento[]> {
  return (await leer()).lista;
}
export async function listarCarpetas(): Promise<Carpeta[]> {
  return (await leer()).carpetas;
}

async function guardar(cambio: Partial<Archivo>) {
  const nuevo = { ...(await leer()), ...cambio };
  await ref().set({ ...nuevo, actualizadoEn: new Date().toISOString() });
  contarEscrituras(1);
  g.__documentosV2 = nuevo;
}

// ---------- Folders ----------

const nombreCarpeta = (v: unknown) => {
  const n = texto(v, 60);
  if (!n) throw new Error("Escribe un nombre para la carpeta");
  return n;
};

export async function crearCarpeta(nombre: unknown): Promise<Carpeta> {
  const { carpetas } = await leer();
  const n = nombreCarpeta(nombre);
  if (carpetas.some((c) => c.nombre.toLowerCase() === n.toLowerCase())) throw new Error("Ya hay una carpeta con ese nombre");
  const siguiente = Math.max(0, ...carpetas.map((c) => Number(c.id.slice(1)) || 0)) + 1;
  const carpeta = { id: `c${siguiente}`, nombre: n, color: COLORES[(siguiente - 1) % COLORES.length] };
  await guardar({ carpetas: [...carpetas, carpeta] });
  return carpeta;
}

export async function renombrarCarpeta(id: string, nombre: unknown): Promise<void> {
  const { carpetas } = await leer();
  const n = nombreCarpeta(nombre);
  if (!carpetas.some((c) => c.id === id)) throw new Error("Carpeta no encontrada");
  if (carpetas.some((c) => c.id !== id && c.nombre.toLowerCase() === n.toLowerCase())) throw new Error("Ya hay una carpeta con ese nombre");
  await guardar({ carpetas: carpetas.map((c) => (c.id === id ? { ...c, nombre: n } : c)) });
}

/** Only empty folders can be deleted, and never the last one. */
export async function borrarCarpeta(id: string): Promise<void> {
  const { carpetas, lista } = await leer();
  const n = lista.filter((d) => d.carpeta === id).length;
  if (n > 0) throw new Error(`La carpeta tiene ${n} ${n === 1 ? "documento" : "documentos"}: muévelos o bórralos antes`);
  if (carpetas.length <= 1) throw new Error("Tiene que quedar al menos una carpeta");
  await guardar({ carpetas: carpetas.filter((c) => c.id !== id) });
}

// ---------- Documents ----------

async function carpetaValida(v: unknown): Promise<string | null> {
  return (await leer()).carpetas.find((c) => c.id === v)?.id ?? null;
}

export async function subirDocumento(archivo: File, datos: { nombre?: unknown; carpeta?: unknown; fecha?: unknown; nota?: unknown; titulo?: unknown }): Promise<Documento> {
  if (archivo.size === 0) throw new Error("El archivo está vacío");
  if (archivo.size > TAMANO_MAXIMO) throw new Error("El archivo pasa de 25 MB");
  const doc: Documento = {
    id: randomUUID(),
    nombre: texto(datos.nombre, 150) || archivo.name.replace(/\.[^.]+$/, ""),
    carpeta: (await carpetaValida(datos.carpeta)) ?? (await listarCarpetas()).at(-1)!.id,
    fecha: esFecha(datos.fecha) ? datos.fecha : null,
    nota: texto(datos.nota, 500),
    titulo: texto(datos.titulo, 100),
    archivo: nombreArchivo(archivo.name),
    tipo: archivo.type || "application/octet-stream",
    tamano: archivo.size,
    subidoEn: new Date().toISOString(),
  };
  try {
    await bucket()
      .file(ruta(doc))
      .save(Buffer.from(await archivo.arrayBuffer()), { contentType: doc.tipo, resumable: false });
  } catch (e) {
    if (e instanceof Error && /bucket does not exist/i.test(e.message)) throw new Error("Falta activar Storage en la consola de Firebase (Storage → Comenzar)");
    throw e;
  }
  await guardar({ lista: [doc, ...(await listarDocumentos())] });
  return doc;
}

export async function editarDocumento(id: string, cambios: { nombre?: unknown; carpeta?: unknown; fecha?: unknown; nota?: unknown; titulo?: unknown }): Promise<Documento> {
  const lista = await listarDocumentos();
  const actual = lista.find((d) => d.id === id);
  if (!actual) throw new Error("Documento no encontrado");
  const nuevo: Documento = {
    ...actual,
    nombre: cambios.nombre !== undefined ? texto(cambios.nombre, 150) || actual.nombre : actual.nombre,
    carpeta: (await carpetaValida(cambios.carpeta)) ?? actual.carpeta,
    fecha: cambios.fecha === null || cambios.fecha === "" ? null : esFecha(cambios.fecha) ? cambios.fecha : actual.fecha,
    nota: cambios.nota !== undefined ? texto(cambios.nota, 500) : actual.nota,
    titulo: cambios.titulo !== undefined ? texto(cambios.titulo, 100) : (actual.titulo ?? ""),
  };
  await guardar({ lista: lista.map((d) => (d.id === id ? nuevo : d)) });
  return nuevo;
}

export async function borrarDocumento(id: string): Promise<void> {
  const lista = await listarDocumentos();
  const d = lista.find((x) => x.id === id);
  if (!d) return;
  await bucket().file(ruta(d)).delete({ ignoreNotFound: true });
  await guardar({ lista: lista.filter((x) => x.id !== id) });
}

/** A link to the file valid for 5 minutes: shown in the browser, or downloaded when `descargar`. */
export async function enlaceDocumento(id: string, descargar: boolean): Promise<string> {
  const d = (await listarDocumentos()).find((x) => x.id === id);
  if (!d) throw new Error("Documento no encontrado");
  const [url] = await bucket()
    .file(ruta(d))
    .getSignedUrl({
      action: "read",
      expires: Date.now() + 5 * 60_000,
      responseDisposition: `${descargar ? "attachment" : "inline"}; filename="${d.archivo}"`,
      responseType: d.tipo,
    });
  return url;
}
