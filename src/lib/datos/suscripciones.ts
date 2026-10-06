import "server-only";

import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { contarEscrituras, contarLecturas } from "./consumo";
import { esPeriodicidad, type Suscripcion } from "./suscripcionesCalc";

/* Subscriptions and recurring payments: one doc, `config/suscripciones`, kept in memory. */

const g = globalThis as unknown as { __suscripciones?: Suscripcion[] };
const ref = () => adminDb().collection("config").doc("suscripciones");

const esFecha = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function listarSuscripciones(): Promise<Suscripcion[]> {
  if (g.__suscripciones) return g.__suscripciones;
  const snap = await ref().get();
  contarLecturas(1);
  g.__suscripciones = (snap.get("lista") as Suscripcion[] | undefined) ?? [];
  return g.__suscripciones;
}

let cola: Promise<unknown> = Promise.resolve();

/** Applies a change to the list, one change after another so none is lost. */
function modificar(cambio: (lista: Suscripcion[]) => Suscripcion[]): Promise<void> {
  const paso = cola.then(async () => {
    const lista = cambio(await listarSuscripciones());
    await ref().set({ lista, actualizadoEn: new Date().toISOString() });
    contarEscrituras(1);
    g.__suscripciones = lista;
  });
  cola = paso.catch(() => {});
  return paso;
}

/** The fields sent by the page, checked; `actual` fills what isn't sent (when editing). */
function campos(c: Record<string, unknown>, actual?: Suscripcion): Omit<Suscripcion, "id" | "creadaEn"> {
  const nombre = c.nombre !== undefined ? texto(c.nombre, 80) : (actual?.nombre ?? "");
  if (!nombre) throw new Error("Ponle un nombre");
  const importe = c.importe !== undefined ? Number(String(c.importe).replace(",", ".")) : actual?.importe;
  if (importe === undefined || !Number.isFinite(importe) || importe < 0) throw new Error("El importe no es válido");
  const fechaPago = c.fechaPago !== undefined ? c.fechaPago : actual?.fechaPago;
  if (!esFecha(fechaPago)) throw new Error("Pon la fecha del próximo pago");
  const periodicidad = c.periodicidad !== undefined ? c.periodicidad : actual?.periodicidad;
  if (!esPeriodicidad(periodicidad)) throw new Error("Elige cada cuánto se paga");
  const avisar = c.avisarDias !== undefined ? Math.round(Number(c.avisarDias)) : (actual?.avisarDias ?? 7);
  return {
    nombre,
    importe: Math.round(importe * 100) / 100,
    moneda: typeof c.moneda === "string" && /^[A-Z]{3}$/.test(c.moneda) ? c.moneda : (actual?.moneda ?? "EUR"),
    periodicidad,
    fechaPago,
    avisarDias: Number.isFinite(avisar) ? Math.min(60, Math.max(0, avisar)) : 7,
    metodo: c.metodo !== undefined ? texto(c.metodo, 60) : (actual?.metodo ?? ""),
    nota: c.nota !== undefined ? texto(c.nota, 300) : (actual?.nota ?? ""),
    activa: typeof c.activa === "boolean" ? c.activa : (actual?.activa ?? true),
  };
}

export async function crearSuscripcion(c: Record<string, unknown>): Promise<Suscripcion> {
  const nueva: Suscripcion = { id: randomUUID(), creadaEn: new Date().toISOString(), ...campos(c) };
  await modificar((lista) => [...lista, nueva]);
  return nueva;
}

export async function editarSuscripcion(id: string, c: Record<string, unknown>): Promise<Suscripcion> {
  const actual = (await listarSuscripciones()).find((s) => s.id === id);
  if (!actual) throw new Error("Suscripción no encontrada");
  const nueva: Suscripcion = { ...actual, ...campos(c, actual) };
  await modificar((lista) => lista.map((s) => (s.id === id ? nueva : s)));
  return nueva;
}

export async function borrarSuscripcion(id: string): Promise<void> {
  await modificar((lista) => lista.filter((s) => s.id !== id));
}
