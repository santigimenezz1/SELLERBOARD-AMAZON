import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { articulosEnvioFBA, enviosFBA, type ArticuloEnvio, type EnvioFBA } from "@/lib/amazon/apis";
import { contarEscrituras, contarLecturas } from "./consumo";

/*
 * Inbound shipments to Amazon's warehouses (FBA15…), with units sent and
 * received per SKU. One doc, `config/enviosFBA`, kept in memory. Each sync
 * asks for the shipments updated lately and only re-reads the items of the
 * new ones and those still open: a closed shipment never changes again.
 */

const HISTORICO_DIAS = 365;
const SOLAPE_DIAS = 7;
const FINALES = new Set(["CLOSED", "CANCELLED", "DELETED"]);

export type EnvioGuardado = EnvioFBA & {
  /** Creation time from Amazon's default name "FBA STA (21/12/2025 10:34)…", null for renamed shipments. */
  creado: string | null;
  region: "eu" | "uk";
  articulos: ArticuloEnvio[];
};
type Doc = { envios: EnvioGuardado[]; actualizadoEn: string | null };

/** The items endpoint allows ~2 calls/s: pacing avoids the throttling back-off on the first (year-long) load. */
const PAUSA_MS = 550;

const g = globalThis as unknown as { __enviosFBA?: Doc; __enviosEnCurso?: Promise<number> };
const ref = () => adminDb().collection("config").doc("enviosFBA");

// UK fulfilment centres (the rest of this account's shipments go to the Pan-European pool).
const CENTROS_UK = /^(LBA|BHX|EMA|MAN|LTN|EDI|CWL|BRS|LCY|GLA|EUK|XUK|NCL|DSA|SNS|MME|BSA|STN|LPL|DOX|RYW|TIL|DXW|PAD|BOH|NUQ)/;

function creadoDe(nombre: string): string | null {
  const m = nombre.match(/\((\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})\)/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00` : null;
}

async function leer(): Promise<Doc> {
  if (g.__enviosFBA) return g.__enviosFBA;
  const snap = await ref().get();
  contarLecturas(1);
  g.__enviosFBA = { envios: (snap.get("envios") as EnvioGuardado[] | undefined) ?? [], actualizadoEn: (snap.get("actualizadoEn") as string | undefined) ?? null };
  return g.__enviosFBA;
}

/** Sync stage. Returns writes done (1 if anything changed). A call while another runs joins it. */
export function actualizarEnvios(marketplaceId: string): Promise<number> {
  g.__enviosEnCurso ??= refrescar(marketplaceId).finally(() => {
    g.__enviosEnCurso = undefined;
  });
  return g.__enviosEnCurso;
}

async function refrescar(marketplaceId: string): Promise<number> {
  const actual = await leer();
  const desde = new Date(actual.actualizadoEn ? new Date(actual.actualizadoEn).getTime() - SOLAPE_DIAS * 86_400_000 : Date.now() - HISTORICO_DIAS * 86_400_000);
  const recientes = await enviosFBA(marketplaceId, desde);
  const porId = new Map(actual.envios.map((e) => [e.id, e]));
  for (const e of recientes) {
    if (e.estado === "DELETED") {
      porId.delete(e.id);
      continue;
    }
    const previo = porId.get(e.id);
    // Items only when new, still open, or its status just changed (e.g. it was closed since the last look).
    const releer = !previo || !FINALES.has(e.estado) || previo.estado !== e.estado;
    let articulos = previo?.articulos ?? [];
    if (releer) {
      articulos = await articulosEnvioFBA(marketplaceId, e.id);
      await new Promise((r) => setTimeout(r, PAUSA_MS));
    }
    porId.set(e.id, { ...e, creado: creadoDe(e.nombre), region: CENTROS_UK.test(e.centro) ? "uk" : "eu", articulos });
  }
  const limite = new Date(Date.now() - HISTORICO_DIAS * 86_400_000).toISOString();
  const envios = [...porId.values()]
    .filter((e) => !e.creado || e.creado >= limite || !FINALES.has(e.estado))
    .sort((a, b) => (b.creado ?? "").localeCompare(a.creado ?? "") || b.id.localeCompare(a.id));
  const cambio = JSON.stringify(envios) !== JSON.stringify(actual.envios);
  const doc: Doc = { envios, actualizadoEn: new Date().toISOString() };
  g.__enviosFBA = doc;
  // The refresh time alone isn't worth a write: the overlap window absorbs a missed update.
  if (!cambio && actual.actualizadoEn) return 0;
  await ref().set(doc);
  contarEscrituras(1);
  return 1;
}

export async function obtenerEnvios(): Promise<Doc> {
  return leer();
}
