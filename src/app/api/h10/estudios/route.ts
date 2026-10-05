import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { crearEstudio } from "@/lib/datos/estudiosH10";
import { volcarConsumo } from "@/lib/datos/consumo";

/** Creates a Helium 10 study. Body: { nombre, descripcion }. */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  try {
    const id = await crearEstudio((await req.json().catch(() => ({}))) as Record<string, unknown>);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo crear" }, { status: 400 });
  }
}
