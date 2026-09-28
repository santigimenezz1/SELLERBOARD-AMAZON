import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { actualizarGastos, importarHistoricoGastos } from "@/lib/datos/gastos";

function autorizado(req: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET ?? "";
  const recibido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secreto.length < 32 || recibido.length !== secreto.length) return false;
  return timingSafeEqual(Buffer.from(recibido), Buffer.from(secreto));
}

type Estado = { en: "curso" | "hecho" | "error"; inicio: string; pendientes?: number; historico?: number; error?: string };
const g = globalThis as unknown as { __cargaGastos?: Estado };

/**
 * One-off load of the account charges, in the background: every settlement report Amazon still keeps (90
 * days, read a few at a time with pauses because downloads are throttled), then the month-level history
 * before them from `?desde=YYYY-MM` (default 2026-01). POST starts it; GET tells how it's going.
 */
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (g.__cargaGastos?.en === "curso") return NextResponse.json({ error: "Ya hay una carga en curso", estado: g.__cargaGastos }, { status: 409 });
  const desde = /^\d{4}-\d{2}$/.test(req.nextUrl.searchParams.get("desde") ?? "") ? req.nextUrl.searchParams.get("desde")! : "2026-01";
  const estado: Estado = { en: "curso", inicio: new Date().toISOString() };
  g.__cargaGastos = estado;
  (async () => {
    // Each round keeps what it read; a throttled round just waits longer and tries again.
    let pendientes = Infinity;
    for (let fallos = 0; pendientes > 0; ) {
      try {
        pendientes = await actualizarGastos(5);
        estado.pendientes = pendientes;
        fallos = 0;
      } catch (e) {
        if (++fallos > 10) throw e;
      }
      if (pendientes > 0) await new Promise((r) => setTimeout(r, fallos ? 120_000 : 70_000));
    }
    estado.pendientes = 0;
    estado.historico = await importarHistoricoGastos(desde);
    estado.en = "hecho";
  })().catch((e) => {
    console.error("[api/cron/gastos]", e);
    Object.assign(estado, { en: "error", error: e instanceof Error ? e.message : String(e) });
  });
  return NextResponse.json({ ok: true, estado }, { status: 202 });
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json({ estado: g.__cargaGastos ?? null });
}
