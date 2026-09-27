import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import type { Componente, EventoServicio } from "@/lib/amazon/apis";
import { contarEscrituras, contarLecturas } from "./consumo";
import { eurPorUnidad } from "@/lib/amazon/tiposCambio";

/*
 * What each inbound shipment cost. Amazon Global Logistics bills its freight
 * and the import duties/taxes as account fees tagged with the shipment id
 * (FBA15…), so those come from the financial events on every sync; shipments
 * sent by other means get their cost typed in by hand. One doc,
 * `config/costesEnvios`, kept in memory.
 */

export type TipoCargo = "flete" | "impuestos" | "transporte";
export type CargoEnvio = { envio: string; tipo: TipoCargo; importe: number; moneda: string };
export type CosteManual = { coste: number; actualizadoEn: string };
type Doc = { cargos: Record<string, CargoEnvio>; manuales: Record<string, CosteManual>; historico: boolean };

const g = globalThis as unknown as { __costesEnvios?: Doc };
const ref = () => adminDb().collection("config").doc("costesEnvios");

export async function obtenerCostesEnvios(): Promise<Doc> {
  if (g.__costesEnvios) return g.__costesEnvios;
  const snap = await ref().get();
  contarLecturas(1);
  g.__costesEnvios = {
    cargos: (snap.get("cargos") as Doc["cargos"] | undefined) ?? {},
    manuales: (snap.get("manuales") as Doc["manuales"] | undefined) ?? {},
    historico: (snap.get("historico") as boolean | undefined) ?? false,
  };
  return g.__costesEnvios;
}

/**
 * Amazon has used two naming schemes for AGL: FBAInternationalInboundFreightFee / …TaxAndDuty and (older)
 * GlobalInboundTransportationFreight / …Duty. Partnered-carrier shipments from within Europe bill
 * FBAInboundTransportationFee.
 */
function tipoDe(feeType: string): TipoCargo | null {
  if (!/Inbound/i.test(feeType)) return null;
  if (/Duty|Tax/i.test(feeType)) return "impuestos";
  if (/Freight/i.test(feeType)) return "flete";
  if (/Transportation/i.test(feeType)) return "transporte";
  return null;
}

/**
 * Inbound charges tagged with a shipment id. Fee events carry no id of their own, so each gets a key from
 * its content plus its position among identical ones: re-reading the same window yields the same keys.
 */
export function cargosDeEnvios(eventos: EventoServicio[]): Record<string, CargoEnvio> {
  const res: Record<string, CargoEnvio> = {};
  const vistos: Record<string, number> = {};
  for (const e of eventos) {
    const envio = e.AmazonOrderId ?? "";
    if (!/^FBA/i.test(envio)) continue;
    for (const f of e.FeeList ?? ([] as Componente[])) {
      const tipo = tipoDe(f.FeeType ?? "");
      const importe = -(Number(f.FeeAmount?.CurrencyAmount) || 0);
      if (!tipo || !importe) continue;
      const moneda = f.FeeAmount?.CurrencyCode ?? "EUR";
      const base = `${envio}|${f.FeeType}|${importe}|${moneda}`;
      vistos[base] = (vistos[base] ?? 0) + 1;
      res[`${base}|${vistos[base]}`] = { envio, tipo, importe: Math.round(importe * 100) / 100, moneda };
    }
  }
  return res;
}

/** Merges charges from a sync window (and marks the one-off look-back as done). Returns writes done. */
export async function guardarCargosEnvios(nuevos: Record<string, CargoEnvio>, historico = false): Promise<number> {
  const actual = await obtenerCostesEnvios();
  const cargos = { ...actual.cargos, ...nuevos };
  const cambio = JSON.stringify(cargos) !== JSON.stringify(actual.cargos) || (historico && !actual.historico);
  if (!cambio) return 0;
  const doc: Doc = { ...actual, cargos, historico: actual.historico || historico };
  await ref().set(doc);
  contarEscrituras(1);
  g.__costesEnvios = doc;
  return 1;
}

/** Hand-typed total cost (euros) of a shipment; null removes it. One write. */
export async function guardarCosteManual(envio: string, coste: number | null): Promise<void> {
  if (!/^FBA[A-Z0-9]{5,20}$/i.test(envio)) throw new Error("Envío no válido");
  if (coste !== null && (!Number.isFinite(coste) || coste < 0 || coste > 1_000_000)) throw new Error("El coste debe ser un número positivo");
  const actual = await obtenerCostesEnvios();
  const manuales = { ...actual.manuales };
  if (coste === null) delete manuales[envio];
  else manuales[envio] = { coste: Math.round(coste * 100) / 100, actualizadoEn: new Date().toISOString() };
  const doc: Doc = { ...actual, manuales };
  await ref().set(doc);
  contarEscrituras(1);
  g.__costesEnvios = doc;
}

export type CosteEnvio = {
  fuente: "amazon" | "manual";
  moneda: string;
  total: number;
  flete: number;
  impuestos: number;
  transporte: number;
};

/** Cost per shipment id: Amazon's charges when there are any, otherwise the hand-typed one. */
export function costesPorEnvio(doc: Doc): Record<string, CosteEnvio> {
  const res: Record<string, CosteEnvio> = {};
  for (const [clave, c] of Object.entries(doc.cargos)) {
    const e = (res[c.envio] ??= { fuente: "amazon", moneda: c.moneda, total: 0, flete: 0, impuestos: 0, transporte: 0 });
    // Classified again from the stored fee name (key's 2nd part), so charges saved before a rule change follow it.
    e[tipoDe(clave.split("|")[1] ?? "") ?? c.tipo] += c.importe;
    e.total += c.importe;
  }
  for (const [envio, m] of Object.entries(doc.manuales)) res[envio] ??= { fuente: "manual", moneda: "EUR", total: m.coste, flete: 0, impuestos: 0, transporte: 0 };
  for (const e of Object.values(res)) for (const k of ["total", "flete", "impuestos", "transporte"] as const) e[k] = Math.round(e[k] * 100) / 100;
  return res;
}

export type CosteEnvioConEuros = CosteEnvio & { euros: number | null };

/**
 * Adds the euro value of costs billed in another currency (AGL to the UK comes in pounds), at the ECB rate of
 * the day the shipment was created (today for renamed shipments); null if the rate can't be fetched.
 */
export async function conEuros(costes: Record<string, CosteEnvio>, fechas: Record<string, string | null>): Promise<Record<string, CosteEnvioConEuros>> {
  const res: Record<string, CosteEnvioConEuros> = {};
  await Promise.all(
    Object.entries(costes).map(async ([envio, c]) => {
      if (c.moneda === "EUR") return void (res[envio] = { ...c, euros: c.total });
      const fecha = fechas[envio] ? new Date(fechas[envio]!) : new Date();
      const cambio = await eurPorUnidad(c.moneda, fecha).catch(() => null);
      res[envio] = { ...c, euros: cambio ? Math.round(c.total * cambio * 100) / 100 : null };
    }),
  );
  return res;
}
