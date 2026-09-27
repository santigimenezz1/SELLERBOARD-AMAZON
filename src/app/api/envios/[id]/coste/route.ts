import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { guardarCosteManual } from "@/lib/datos/costesEnvios";
import { volcarConsumo } from "@/lib/datos/consumo";

/** Saves the hand-typed total cost (euros) of an inbound shipment. Body: { coste: number | null } (null clears it). */
export async function PUT(req: NextRequest, { params }: RouteContext<"/api/envios/[id]/coste">) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { coste?: unknown };
  const coste = body.coste === null || body.coste === undefined || body.coste === "" ? null : Number(body.coste);
  try {
    await guardarCosteManual(id, coste);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 400 });
  }
}
