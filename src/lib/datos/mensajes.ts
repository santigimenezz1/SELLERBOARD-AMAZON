import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { correosClientesNuevos, type CorreoCliente } from "@/lib/gmail";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * Buyer messages. Amazon's API can't read them, but it emails a copy of each one (…@marketplace.amazon.xx) to the
 * address set in Seller Central's notification preferences; the connected Gmail is read (read only). One doc,
 * `config/mensajesClientes`, kept in memory; the complete sync adds the new ones.
 */

type Doc = { lista: CorreoCliente[]; actualizadoEn: string | null };
const MAXIMO = 400;
const g = globalThis as unknown as { __mensajesClientes?: Doc };
const ref = () => adminDb().collection("config").doc("mensajesClientes");

export async function obtenerMensajes(): Promise<Doc> {
  if (g.__mensajesClientes) return g.__mensajesClientes;
  const snap = await ref().get();
  contarLecturas(1);
  g.__mensajesClientes = { lista: (snap.get("lista") as CorreoCliente[] | undefined) ?? [], actualizadoEn: (snap.get("actualizadoEn") as string | undefined) ?? null };
  return g.__mensajesClientes;
}

/** Adds the messages not stored yet. Returns the new ones (the alert will use them). */
export async function actualizarMensajes(): Promise<CorreoCliente[]> {
  const doc = await obtenerMensajes();
  const nuevos = await correosClientesNuevos(new Set(doc.lista.map((m) => m.id)));
  if (nuevos.length === 0 && doc.actualizadoEn) return [];
  const lista = [...nuevos, ...doc.lista].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, MAXIMO);
  const nuevo = { lista, actualizadoEn: new Date().toISOString() };
  await ref().set(nuevo);
  contarEscrituras(1);
  g.__mensajesClientes = nuevo;
  return nuevos;
}
