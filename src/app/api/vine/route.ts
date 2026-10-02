import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { guardarInscripcionesVine } from "@/lib/datos/vine";
import { volcarConsumo } from "@/lib/datos/consumo";

/** Saves one marketplace's Vine enrollments. Body: { marketplaceId, filas: InscripcionVine[] }. */
export async function PUT(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { marketplaceId?: unknown; filas?: unknown };
  try {
    const filas = await guardarInscripcionesVine(String(body.marketplaceId ?? ""), body.filas);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, filas });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 400 });
  }
}
