import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { importarHistorialPedidos } from "@/lib/amazon/sincronizar";

function autorizado(req: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET ?? "";
  const recibido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secreto.length < 32 || recibido.length !== secreto.length) return false;
  return timingSafeEqual(Buffer.from(recibido), Buffer.from(secreto));
}

type Estado = { en: "curso" | "hecho" | "error"; inicio: string; desde: string; hasta: string; resultado?: unknown; error?: string };
const g = globalThis as unknown as { __importacionHistorial?: Estado };

/**
 * One-off import of older orders by purchase date, in the background (Amazon throttles the order list, so it
 * can take many minutes). POST `?meses=6[&hasta=ISO date]` starts it; GET tells how it's going. Same secret as
 * the scheduled sync; already stored orders are just refreshed, so running it twice is harmless.
 */
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (g.__importacionHistorial?.en === "curso") return NextResponse.json({ error: "Ya hay una importación en curso", estado: g.__importacionHistorial }, { status: 409 });
  const meses = Math.min(24, Math.max(1, Number(req.nextUrl.searchParams.get("meses")) || 6));
  const pedidoHasta = new Date(req.nextUrl.searchParams.get("hasta") ?? "");
  const hasta = Number.isFinite(pedidoHasta.getTime()) ? pedidoHasta : new Date(Date.now() - 3 * 60_000);
  const desde = new Date(Date.now());
  desde.setMonth(desde.getMonth() - meses);
  const estado: Estado = { en: "curso", inicio: new Date().toISOString(), desde: desde.toISOString(), hasta: hasta.toISOString() };
  g.__importacionHistorial = estado;
  importarHistorialPedidos(desde, hasta)
    .then((r) => Object.assign(estado, { en: "hecho", resultado: { ...r, errores: r.errores.slice(0, 10) } }))
    .catch((e) => {
      console.error("[api/cron/historial]", e);
      Object.assign(estado, { en: "error", error: e instanceof Error ? e.message : String(e) });
    });
  return NextResponse.json({ ok: true, estado }, { status: 202 });
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json({ estado: g.__importacionHistorial ?? null });
}
