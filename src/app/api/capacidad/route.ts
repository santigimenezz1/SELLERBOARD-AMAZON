import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { guardarLimiteCapacidad } from "@/lib/datos/capacidad";
import { volcarConsumo } from "@/lib/datos/consumo";

/** Saves a region's monthly FBA capacity limit (cubic metres). Body: { region: "eu" | "uk", limite: number | null }. */
export async function PUT(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { region?: unknown; limite?: unknown };
  try {
    const capacidad = await guardarLimiteCapacidad(body.region, body.limite ?? null);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, capacidad });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 400 });
  }
}
