import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { agregarNota, agregarTitulo } from "@/lib/datos/variantes";
import { volcarConsumo } from "@/lib/datos/consumo";

type Ctx = { params: Promise<{ id: string }> };

/** Adds a coloured note. Body: { notas, color, padre, x, y }. */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  try {
    const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // { tipo: "titulo" } adds a free-standing title instead of a note.
    const nodo = cuerpo.tipo === "titulo" ? await agregarTitulo((await params).id, cuerpo) : await agregarNota((await params).id, cuerpo);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, nodo });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo crear" }, { status: 400 });
  }
}
