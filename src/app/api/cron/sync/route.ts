import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { isAmazonConfigured } from "@/lib/amazon/cliente";
import { sincronizar, SyncEnCurso } from "@/lib/amazon/sincronizar";

// A complete sync (once an hour) can take a couple of minutes.
export const maxDuration = 300;

function autorizado(req: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET ?? "";
  const recibido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secreto.length < 32 || recibido.length !== secreto.length) return false;
  return timingSafeEqual(Buffer.from(recibido), Buffer.from(secreto));
}

/**
 * Scheduled sync, called every 5 minutes by an external scheduler with `Authorization: Bearer <CRON_SECRET>`
 * (no user session). Orders every time; everything else when the last complete sync is an hour old.
 */
async function ejecutar(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!isAmazonConfigured) return NextResponse.json({ error: "Faltan las credenciales de Amazon" }, { status: 500 });
  try {
    const r = await sincronizar("auto");
    return NextResponse.json({ ok: true, completa: r.completa, pedidosNuevos: r.pedidosNuevos, escrituras: r.escrituras, errores: r.errores, duracionMs: r.duracionMs });
  } catch (e) {
    // Another sync (the button, or a slow previous run) is on: this round is simply skipped.
    if (e instanceof SyncEnCurso) return NextResponse.json({ ok: true, omitida: true });
    console.error("[api/cron/sync]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

export const GET = ejecutar;
export const POST = ejecutar;
