import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { agregarNodo, borrarTablero, moverNodos, renombrarTablero } from "@/lib/datos/variantes";
import { volcarConsumo } from "@/lib/datos/consumo";

type Ctx = { params: Promise<{ id: string }> };

const comprobar = async (req: NextRequest) => {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  return null;
};

/** Adds a product or component. Form data: archivo (the image), tipo, nombre, padre, x, y. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const no = await comprobar(req);
  if (no) return no;
  const datos = await req.formData().catch(() => null);
  const archivo = datos?.get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
  try {
    const nodo = await agregarNodo((await params).id, archivo, Object.fromEntries([...datos!.entries()].filter(([k]) => k !== "archivo")));
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, nodo });
  } catch (e) {
    console.error("[api/variantes]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo subir" }, { status: 400 });
  }
}

/** Renames the board ({ nombre }) or moves several elements at once ({ posiciones: [{ id, x, y }] }). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const no = await comprobar(req);
  if (no) return no;
  try {
    const cuerpo = (await req.json().catch(() => ({}))) as { nombre?: unknown; posiciones?: unknown };
    if (cuerpo.posiciones !== undefined) await moverNodos((await params).id, cuerpo.posiciones);
    else await renombrarTablero((await params).id, cuerpo.nombre);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 400 });
  }
}

/** Deletes the board and its images. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const no = await comprobar(req);
  if (no) return no;
  try {
    await borrarTablero((await params).id);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo borrar" }, { status: 400 });
  }
}
