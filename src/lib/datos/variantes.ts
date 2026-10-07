import "server-only";

import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { familiaCatalogo } from "@/lib/amazon/apis";
import { bucket } from "./documentos";
import { contarEscrituras, contarLecturas } from "./consumo";
import { ANCHOS, COLORES_NOTA, LIMITE_LIENZO, esTipoNodo, type NodoVariante, type TableroVariantes } from "./variantesTipos";

/*
 * «Variantes» boards. The list is one doc, `config/variantes`, kept in memory; each node's image lives in Firebase
 * Storage under `variantes/{board}/{node}/{file}`, private, shown through a signed link for a logged-in user.
 */

export const TAMANO_MAXIMO_VARIANTE = 10 * 1024 * 1024;
/** Amazon Spain: where listings are imported from. */
const MARKETPLACE_ES = "A1RKKUPIHCS9HS";

const g = globalThis as unknown as { __variantes?: TableroVariantes[] };
const ref = () => adminDb().collection("config").doc("variantes");
const ruta = (t: string, n: Pick<NodoVariante, "id" | "archivo">) => `variantes/${t}/${n.id}/${n.archivo}`;
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const numero = (v: unknown, min: number, max: number) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : undefined);
const posicion = (v: unknown) => numero(v, -LIMITE_LIENZO, LIMITE_LIENZO);
const nombreArchivo = (n: string) => n.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(-120) || "imagen";
const esAsin = (v: unknown): v is string => typeof v === "string" && /^[A-Z0-9]{10}$/.test(v);

export async function listarTableros(): Promise<TableroVariantes[]> {
  if (g.__variantes) return g.__variantes;
  const snap = await ref().get();
  contarLecturas(1);
  g.__variantes = (snap.get("tableros") as TableroVariantes[] | undefined) ?? [];
  return g.__variantes;
}

let cola: Promise<unknown> = Promise.resolve();

/** Applies a change to the boards, one change after another so none is lost (dragging saves often). */
function modificar(cambio: (lista: TableroVariantes[]) => TableroVariantes[]): Promise<void> {
  const paso = cola.then(async () => {
    const tableros = cambio(await listarTableros());
    await ref().set({ tableros, actualizadoEn: new Date().toISOString() });
    contarEscrituras(1);
    g.__variantes = tableros;
  });
  cola = paso.catch(() => {});
  return paso;
}

async function tablero(id: string): Promise<TableroVariantes> {
  const t = (await listarTableros()).find((x) => x.id === id);
  if (!t) throw new Error("Tablero no encontrado");
  return t;
}
const cambiarTablero = (id: string, cambio: (t: TableroVariantes) => TableroVariantes) => modificar((lista) => lista.map((t) => (t.id === id ? cambio(t) : t)));

async function guardarImagen(idTablero: string, nodo: NodoVariante, datos: Buffer) {
  try {
    await bucket().file(ruta(idTablero, nodo)).save(datos, { contentType: nodo.tipoArchivo, resumable: false });
  } catch (e) {
    if (e instanceof Error && /bucket does not exist/i.test(e.message)) throw new Error("Falta activar Storage en la consola de Firebase (Storage → Comenzar)");
    throw e;
  }
}

export async function crearTablero(nombre: unknown): Promise<TableroVariantes> {
  const nuevo: TableroVariantes = { id: randomUUID(), nombre: texto(nombre, 80) || "Nuevo tablero", nodos: [], creadoEn: new Date().toISOString() };
  await modificar((lista) => [...lista, nuevo]);
  return nuevo;
}

export async function renombrarTablero(id: string, nombre: unknown): Promise<void> {
  const limpio = texto(nombre, 80);
  if (!limpio) throw new Error("Ponle un nombre");
  await tablero(id);
  await cambiarTablero(id, (t) => ({ ...t, nombre: limpio }));
}

export async function borrarTablero(id: string): Promise<void> {
  await bucket().deleteFiles({ prefix: `variantes/${id}/` }).catch(() => {});
  await modificar((lista) => lista.filter((t) => t.id !== id));
}

/** Adds a listing, variant or component with its image; variants and components hang from `padre`. */
export async function agregarNodo(idTablero: string, archivo: File, c: Record<string, unknown>): Promise<NodoVariante> {
  if (!archivo.type.startsWith("image/")) throw new Error("Tiene que ser una imagen");
  if (archivo.size === 0) throw new Error("La imagen está vacía");
  if (archivo.size > TAMANO_MAXIMO_VARIANTE) throw new Error("La imagen pasa de 10 MB");
  const t = await tablero(idTablero);
  const tipo = esTipoNodo(c.tipo) && c.tipo !== "nota" ? c.tipo : "componente";
  const padre = typeof c.padre === "string" && t.nodos.some((n) => n.id === c.padre) ? c.padre : null;
  const nodo: NodoVariante = {
    id: randomUUID(),
    tipo,
    nombre: texto(c.nombre, 80) || nombreArchivo(archivo.name).replace(/\.[^.]+$/, "").replace(/_/g, " "),
    notas: "",
    x: posicion(c.x) ?? 100,
    y: posicion(c.y) ?? 100,
    ancho: ANCHOS[tipo],
    padre: tipo === "producto" ? null : padre,
    archivo: nombreArchivo(archivo.name),
    tipoArchivo: archivo.type,
  };
  await guardarImagen(idTablero, nodo, Buffer.from(await archivo.arrayBuffer()));
  await cambiarTablero(idTablero, (x) => ({ ...x, nodos: [...x.nodos, nodo] }));
  return nodo;
}

/** Adds a coloured note, with its arrow from `padre` when given. */
export async function agregarNota(idTablero: string, c: Record<string, unknown>): Promise<NodoVariante> {
  const t = await tablero(idTablero);
  const nodo: NodoVariante = {
    id: randomUUID(),
    tipo: "nota",
    nombre: "",
    notas: texto(c.notas, 2000) || "Nota",
    color: COLORES_NOTA.includes(c.color as (typeof COLORES_NOTA)[number]) ? (c.color as string) : COLORES_NOTA[0],
    x: posicion(c.x) ?? 100,
    y: posicion(c.y) ?? 100,
    ancho: ANCHOS.nota,
    padre: typeof c.padre === "string" && t.nodos.some((n) => n.id === c.padre) ? c.padre : null,
    archivo: "",
    tipoArchivo: "",
  };
  await cambiarTablero(idTablero, (x) => ({ ...x, nodos: [...x.nodos, nodo] }));
  return nodo;
}

/**
 * Imports one of your listings from Amazon (Spain): the listing with its main photo and, when it has variations,
 * each variant (colour, size…) with its own photo and ASIN, hanging from it in a column. Placed to the right of what
 * the board already has.
 */
export async function importarListing(idTablero: string, asin: unknown): Promise<number> {
  if (!esAsin(asin)) throw new Error("ASIN no válido");
  const t = await tablero(idTablero);
  const familia = await familiaCatalogo(asin, MARKETPLACE_ES);
  if (!familia) throw new Error("Amazon no encuentra ese ASIN en España");
  const x0 = t.nodos.length ? Math.max(...t.nodos.map((n) => n.x + n.ancho)) + 300 : 0;
  const alto = ANCHOS.variante + 110;
  const y0 = t.nodos.length ? Math.min(...t.nodos.map((n) => n.y)) : 0;
  const atributo = (m: { color: string | null; talla: string | null }) =>
    [m.color && `Color: ${m.color}`, m.talla && familia.tema.includes("size") && `Talla: ${m.talla}`].filter(Boolean).join(" · ");

  /** Amazon's photo, stored like an uploaded one (Amazon's links can change). */
  const conImagen = async (base: Omit<NodoVariante, "archivo" | "tipoArchivo">, url: string | null): Promise<NodoVariante | null> => {
    if (!url) return null;
    const r = await fetch(url).catch(() => null);
    if (!r?.ok) return null;
    const tipoArchivo = r.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const nodo: NodoVariante = { ...base, archivo: `${base.asin ?? "imagen"}.${tipoArchivo.includes("png") ? "png" : "jpg"}`, tipoArchivo };
    await guardarImagen(idTablero, nodo, Buffer.from(await r.arrayBuffer()));
    return nodo;
  };

  const listing = await conImagen(
    {
      id: randomUUID(),
      tipo: "producto",
      nombre: (familia.listing.titulo ?? asin).slice(0, 80),
      asin: familia.listing.asin,
      atributo: familia.variantes.length ? `${familia.variantes.length} variantes` : atributo(familia.listing),
      notas: "",
      x: x0,
      y: y0 + Math.max(0, ((familia.variantes.length - 1) * alto) / 2),
      ancho: ANCHOS.producto,
      padre: null,
    },
    familia.listing.imagen,
  );
  if (!listing) throw new Error("No se pudo traer la foto del listing");
  const variantes: NodoVariante[] = [];
  for (const [i, v] of familia.variantes.entries()) {
    const nodo = await conImagen(
      {
        id: randomUUID(),
        tipo: "variante",
        nombre: (v.color ?? v.talla ?? v.titulo ?? v.asin).slice(0, 80),
        asin: v.asin,
        atributo: atributo(v),
        notas: "",
        x: x0 + ANCHOS.producto + 220,
        y: y0 + i * alto,
        ancho: ANCHOS.variante,
        padre: listing.id,
      },
      v.imagen,
    );
    if (nodo) variantes.push(nodo);
  }
  await cambiarTablero(idTablero, (x) => ({ ...x, nodos: [...x.nodos, listing, ...variantes] }));
  return 1 + variantes.length;
}

/** Moves or edits a node: position, size, name, type, attribute, ASIN, notes or the node its arrow comes from. */
export async function editarNodo(idTablero: string, idNodo: string, c: Record<string, unknown>): Promise<void> {
  const t = await tablero(idTablero);
  const actual = t.nodos.find((n) => n.id === idNodo);
  if (!actual) throw new Error("Elemento no encontrado");
  // An arrow can't come from the node itself or from one hanging below it (it would make a loop).
  const debajo = (id: string | null): boolean => !!id && (id === idNodo || debajo(t.nodos.find((n) => n.id === id)?.padre ?? null));
  const padre = c.padre === null ? null : typeof c.padre === "string" && t.nodos.some((n) => n.id === c.padre) && !debajo(c.padre) ? c.padre : actual.padre;
  const nuevo: NodoVariante = {
    ...actual,
    x: posicion(c.x) ?? actual.x,
    y: posicion(c.y) ?? actual.y,
    ancho: numero(c.ancho, 60, 600) ?? actual.ancho,
    tipo: esTipoNodo(c.tipo) ? c.tipo : actual.tipo,
    nombre: c.nombre !== undefined ? texto(c.nombre, 80) : actual.nombre,
    atributo: c.atributo !== undefined ? texto(c.atributo, 80) : actual.atributo,
    asin: c.asin !== undefined ? (esAsin(c.asin) ? c.asin : undefined) : actual.asin,
    notas: c.notas !== undefined ? texto(c.notas, 2000) : actual.notas,
    color: COLORES_NOTA.includes(c.color as (typeof COLORES_NOTA)[number]) ? (c.color as string) : actual.color,
    padre: c.padre !== undefined ? padre : actual.padre,
  };
  // A note stays a note, and an image an image.
  if ((actual.tipo === "nota") !== (nuevo.tipo === "nota")) nuevo.tipo = actual.tipo;
  if (nuevo.tipo === "producto") nuevo.padre = null;
  if (!nuevo.asin) delete nuevo.asin;
  await cambiarTablero(idTablero, (x) => ({ ...x, nodos: x.nodos.map((n) => (n.id === idNodo ? nuevo : n)) }));
}

/** Several positions at once («Organizar»). */
export async function moverNodos(idTablero: string, posiciones: unknown): Promise<void> {
  if (!Array.isArray(posiciones)) throw new Error("Posiciones no válidas");
  const nuevas = new Map<string, { x: number; y: number }>();
  for (const p of posiciones as { id?: unknown; x?: unknown; y?: unknown }[]) {
    const x = posicion(p?.x);
    const y = posicion(p?.y);
    if (typeof p?.id === "string" && x !== undefined && y !== undefined) nuevas.set(p.id, { x, y });
  }
  await tablero(idTablero);
  await cambiarTablero(idTablero, (t) => ({ ...t, nodos: t.nodos.map((n) => ({ ...n, ...nuevas.get(n.id) })) }));
}

/** Deletes a node and its image; what hung from it now hangs from its own parent. */
export async function borrarNodo(idTablero: string, idNodo: string): Promise<void> {
  const t = await tablero(idTablero);
  const nodo = t.nodos.find((n) => n.id === idNodo);
  if (!nodo) return;
  if (nodo.archivo) await bucket().file(ruta(idTablero, nodo)).delete({ ignoreNotFound: true });
  await cambiarTablero(idTablero, (x) => ({ ...x, nodos: x.nodos.filter((n) => n.id !== idNodo).map((n) => (n.padre === idNodo ? { ...n, padre: nodo.padre } : n)) }));
}

/** A link to the node's image valid for an hour. */
export async function enlaceImagen(idTablero: string, idNodo: string): Promise<string> {
  const nodo = (await tablero(idTablero)).nodos.find((n) => n.id === idNodo);
  if (!nodo) throw new Error("Elemento no encontrado");
  const [url] = await bucket()
    .file(ruta(idTablero, nodo))
    .getSignedUrl({ action: "read", expires: Date.now() + 60 * 60_000, responseType: nodo.tipoArchivo });
  return url;
}
