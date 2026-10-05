import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { borrarEstudio, editarEstudio } from "@/lib/datos/estudiosH10";
import { volcarConsumo } from "@/lib/datos/consumo";

type Ctx = { params: Promise<{ id: string }> };

/** Renames a study. Body: { nombre, descripcion }. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  try {
    await editarEstudio((await params).id, (await req.json().catch(() => ({}))) as Record<string, unknown>);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 400 });
  }
}

/** Deletes a study with all its files and data. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  try {
    await borrarEstudio((await params).id);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/h10/estudios]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo borrar" }, { status: 400 });
  }
}
