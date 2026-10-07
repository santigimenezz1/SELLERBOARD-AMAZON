import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { crearTablero } from "@/lib/datos/variantes";
import { volcarConsumo } from "@/lib/datos/consumo";

/** Creates a board. Body: { nombre }. */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  try {
    const cuerpo = (await req.json().catch(() => ({}))) as { nombre?: unknown };
    const tablero = await crearTablero(cuerpo.nombre);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, tablero });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo crear" }, { status: 400 });
  }
}
