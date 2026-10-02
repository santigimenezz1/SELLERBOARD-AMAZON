import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { estadoCargaPalabras, lanzarCargaPalabras, MERCADOS_BUSQUEDA, mercadosPendientes } from "@/lib/datos/palabrasClave";

function autorizado(req: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET ?? "";
  const recibido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secreto.length < 32 || recibido.length !== secreto.length) return false;
  return timingSafeEqual(Buffer.from(recibido), Buffer.from(secreto));
}

/**
 * Loads the latest Brand Analytics week (Palabras clave) in the background: the marketplaces that don't have it,
 * all of them with `?forzar=1`, or one with `?mk=<marketplaceId>`. The complete sync does the same on its own. GET tells how it's going.
 */
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const uno = req.nextUrl.searchParams.get("mk");
  const mercados = uno && MERCADOS_BUSQUEDA.includes(uno) ? [uno] : req.nextUrl.searchParams.get("forzar") === "1" ? MERCADOS_BUSQUEDA : await mercadosPendientes();
  return NextResponse.json({ ok: true, mercados, estado: lanzarCargaPalabras(mercados) }, { status: 202 });
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json({ estado: estadoCargaPalabras() });
}
