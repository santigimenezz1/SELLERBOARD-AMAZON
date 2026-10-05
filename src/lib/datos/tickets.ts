import "server-only";

import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { esLegible, leerTicket, type DatosTicket } from "@/lib/ia/leerTicket";
import { bucket } from "./documentos";
import { armarZip, nombreDescarga, ticketsDelPeriodo } from "./zipTickets";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * Purchase tickets: the photo (or PDF) is kept and Claude reads its date, shop, total and VAT.
 *
 * - Files live in Firebase Storage under `tickets/{id}/{file name}`, private: shown through a signed link that
 *   lasts a few minutes, created for a logged-in user (same as Documentos).
 * - The list is one doc, `config/tickets`, kept in memory.
 */

export type Ticket = DatosTicket & {
  id: string;
  nota: string;
  archivo: string;
  tipo: string;
  tamano: number;
  subidoEn: string;
  /** How the details were filled: read by the AI, typed by hand, or the AI couldn't read it (`error` says why). */
  lectura: "ia" | "manual" | "error";
  error?: string;
};

export const TAMANO_MAXIMO = 15 * 1024 * 1024;

const g = globalThis as unknown as { __tickets?: Ticket[] };
const ref = () => adminDb().collection("config").doc("tickets");
const ruta = (t: Pick<Ticket, "id" | "archivo">) => `tickets/${t.id}/${t.archivo}`;

const esFecha = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const importe = (v: unknown) => (v === null || v === "" ? null : Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : undefined);
const nombreArchivo = (n: string) => n.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(-120) || "ticket";

export async function listarTickets(): Promise<Ticket[]> {
  if (g.__tickets) return g.__tickets;
  const snap = await ref().get();
  contarLecturas(1);
  g.__tickets = (snap.get("lista") as Ticket[] | undefined) ?? [];
  return g.__tickets;
}

let cola: Promise<unknown> = Promise.resolve();

/**
 * Applies a change to the list. Changes run one after another: several tickets uploaded at once each read the
 * list as the previous one left it, so none is lost.
 */
function modificar(cambio: (lista: Ticket[]) => Ticket[]): Promise<void> {
  const paso = cola.then(async () => {
    const lista = cambio(await listarTickets());
    await ref().set({ lista, actualizadoEn: new Date().toISOString() });
    contarEscrituras(1);
    g.__tickets = lista;
  });
  cola = paso.catch(() => {});
  return paso;
}

/** Runs the AI on the file; a failure doesn't lose the ticket, it's marked to be filled by hand or retried. */
async function leer(datos: Buffer, tipo: string): Promise<Pick<Ticket, keyof DatosTicket | "lectura" | "error">> {
  try {
    return { ...(await leerTicket(datos, tipo)), lectura: "ia" };
  } catch (e) {
    console.error("[tickets] lectura IA", e);
    return { fecha: null, comercio: "", total: null, moneda: "EUR", iva: null, concepto: "", lectura: "error", error: e instanceof Error ? e.message : "No se pudo leer" };
  }
}

export async function subirTicket(archivo: File): Promise<Ticket> {
  if (archivo.size === 0) throw new Error("El archivo está vacío");
  if (archivo.size > TAMANO_MAXIMO) throw new Error("El archivo pasa de 15 MB");
  const datos = Buffer.from(await archivo.arrayBuffer());
  const base = {
    id: randomUUID(),
    nota: "",
    archivo: nombreArchivo(archivo.name),
    tipo: archivo.type || "application/octet-stream",
    tamano: archivo.size,
    subidoEn: new Date().toISOString(),
  };
  try {
    await bucket()
      .file(ruta(base))
      .save(datos, { contentType: base.tipo, resumable: false });
  } catch (e) {
    if (e instanceof Error && /bucket does not exist/i.test(e.message)) throw new Error("Falta activar Storage en la consola de Firebase (Storage → Comenzar)");
    throw e;
  }
  const ticket: Ticket = { ...base, ...(esLegible(base.tipo) ? await leer(datos, base.tipo) : { fecha: null, comercio: "", total: null, moneda: "EUR", iva: null, concepto: "", lectura: "error", error: "Formato que la IA no lee: rellénalo a mano" }) };
  await modificar((lista) => [ticket, ...lista]);
  return ticket;
}

/** Reads the stored file again with the AI and replaces the details. */
export async function releerTicket(id: string): Promise<Ticket> {
  const actual = (await listarTickets()).find((t) => t.id === id);
  if (!actual) throw new Error("Ticket no encontrado");
  const [datos] = await bucket().file(ruta(actual)).download();
  const leido = await leer(datos, actual.tipo);
  if (leido.lectura === "error") throw new Error(leido.error);
  const nuevo: Ticket = { ...actual, ...leido };
  delete nuevo.error;
  await modificar((lista) => lista.map((t) => (t.id === id ? { ...nuevo, nota: t.nota } : t)));
  return nuevo;
}

export async function editarTicket(id: string, c: Record<string, unknown>): Promise<Ticket> {
  const lista = await listarTickets();
  const actual = lista.find((t) => t.id === id);
  if (!actual) throw new Error("Ticket no encontrado");
  const total = importe(c.total);
  const iva = importe(c.iva);
  const nuevo: Ticket = {
    ...actual,
    fecha: c.fecha === null || c.fecha === "" ? null : esFecha(c.fecha) ? c.fecha : actual.fecha,
    comercio: c.comercio !== undefined ? texto(c.comercio, 100) : actual.comercio,
    concepto: c.concepto !== undefined ? texto(c.concepto, 120) : actual.concepto,
    nota: c.nota !== undefined ? texto(c.nota, 500) : actual.nota,
    total: c.total !== undefined && total !== undefined ? total : actual.total,
    iva: c.iva !== undefined && iva !== undefined ? iva : actual.iva,
    moneda: typeof c.moneda === "string" && /^[A-Z]{3}$/.test(c.moneda) ? c.moneda : actual.moneda,
    lectura: actual.lectura === "error" ? "manual" : actual.lectura,
  };
  delete nuevo.error;
  await modificar((l) => l.map((t) => (t.id === id ? nuevo : t)));
  return nuevo;
}

export async function borrarTicket(id: string): Promise<void> {
  const t = (await listarTickets()).find((x) => x.id === id);
  if (!t) return;
  await bucket().file(ruta(t)).delete({ ignoreNotFound: true });
  await modificar((lista) => lista.filter((x) => x.id !== id));
}

// ---------- Download as ZIP ----------

/** The period's tickets as a ZIP in folders (see zipTickets.ts). */
export async function zipTickets(periodo: string): Promise<{ zip: Uint8Array; cuantos: number }> {
  const lista = ticketsDelPeriodo(await listarTickets(), periodo);
  const datos: Uint8Array[] = [];
  // Several files at a time from Storage, not all 100 at once.
  for (let i = 0; i < lista.length; i += 8) {
    for (const [d] of await Promise.all(lista.slice(i, i + 8).map((t) => bucket().file(ruta(t)).download()))) datos.push(new Uint8Array(d));
  }
  return { zip: armarZip(lista, datos, periodo), cuantos: lista.length };
}

/** A link to the file valid for 5 minutes: shown in the browser, or downloaded (named by date) when `descargar`. */
export async function enlaceTicket(id: string, descargar: boolean): Promise<string> {
  const t = (await listarTickets()).find((x) => x.id === id);
  if (!t) throw new Error("Ticket no encontrado");
  const { base, ext } = nombreDescarga(t);
  const [url] = await bucket()
    .file(ruta(t))
    .getSignedUrl({
      action: "read",
      expires: Date.now() + 5 * 60_000,
      responseDisposition: `${descargar ? "attachment" : "inline"}; filename="${descargar ? base + ext : t.archivo}"`,
      responseType: t.tipo,
    });
  return url;
}
