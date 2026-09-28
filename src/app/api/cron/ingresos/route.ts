import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { actualizarIngresos, importarCompensaciones } from "@/lib/datos/ingresos";
import { actualizarSaldos } from "@/lib/datos/saldos";
import { asegurarAlmacen, pedidosEnAlmacen } from "@/lib/datos/almacen";
import { idUltimaSync } from "@/lib/datos/panel";

function autorizado(req: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET ?? "";
  const recibido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secreto.length < 32 || recibido.length !== secreto.length) return false;
  return timingSafeEqual(Buffer.from(recibido), Buffer.from(secreto));
}

/**
 * Refreshes Amazon's payouts and balances now (the complete sync also does it every hour). With `?compensaciones=YYYY-MM`
 * it also loads the compensations since that month (one-off: later ones come with each complete sync).
 */
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const desde = req.nextUrl.searchParams.get("compensaciones") ?? "";
    const compensaciones = /^\d{4}-\d{2}$/.test(desde) ? await importarCompensaciones(desde) : null;
    await asegurarAlmacen(await idUltimaSync());
    const hace60 = Date.now() - 60 * 24 * 3600_000;
    await actualizarSaldos([...new Set([...pedidosEnAlmacen().values()].filter((p) => p.fecha.getTime() > hace60).map((p) => p.marketplaceId))]);
    return NextResponse.json({ ok: true, pagos: await actualizarIngresos(), compensaciones });
  } catch (e) {
    console.error("[api/cron/ingresos]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
