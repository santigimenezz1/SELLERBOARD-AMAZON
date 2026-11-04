import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { borrarNodo, editarNodo, enlaceImagen, reemplazarImagen } from "@/lib/datos/variantes";
import { volcarConsumo } from "@/lib/datos/consumo";

type Ctx = { params: Promise<{ id: string; nodo: string }> };

/** The node's image, through a short-lived signed link. */
export async function GET(req: NextRequest, { params }: Ctx) {
  if (!(await getSessionUser())) return NextResponse.redirect(new URL("/login", req.url));
  try {
    const { id, nodo } = await params;
    return NextResponse.redirect(await enlaceImagen(id, nodo));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo abrir" }, { status: 404 });
  }
}

/** Moves or edits the node. Body: any of { x, y, ancho, nombre, notas, padre }. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  try {
    const { id, nodo } = await params;
    await editarNodo(id, nodo, (await req.json().catch(() => ({}))) as Record<string, unknown>);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 400 });
  }
}

/** Replaces the node's image. Form data: archivo. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const archivo = (await req.formData().catch(() => null))?.get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
  try {
    const { id, nodo } = await params;
    const nuevo = await reemplazarImagen(id, nodo, archivo);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, nodo: nuevo });
  } catch (e) {
    console.error("[api/variantes/reemplazar]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo reemplazar" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  try {
    const { id, nodo } = await params;
    await borrarNodo(id, nodo);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo borrar" }, { status: 400 });
  }
}
