import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { usuarioDelEstudio } from "@/lib/auth/estudios";
import { borrarArchivo, enlaceArchivo, releerArchivo } from "@/lib/datos/estudiosH10";
import { volcarConsumo } from "@/lib/datos/consumo";

type Ctx = { params: Promise<{ id: string; archivoId: string }> };

/** Opens the original file (`?descargar=1` downloads it) through a short-lived signed link. */
export async function GET(req: NextRequest, { params }: Ctx) {
  if (!(await usuarioDelEstudio((await params).id))) return NextResponse.redirect(new URL("/login", req.url));
  try {
    const { id, archivoId } = await params;
    return NextResponse.redirect(await enlaceArchivo(id, archivoId, req.nextUrl.searchParams.get("descargar") === "1"));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo abrir" }, { status: 404 });
  }
}

/** Reads the file again with the AI, replacing what was read from it. */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await usuarioDelEstudio((await params).id, true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  try {
    const { id, archivoId } = await params;
    const archivo = await releerArchivo(id, archivoId);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, archivo });
  } catch (e) {
    console.error("[api/h10/archivos] releer", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer" }, { status: 400 });
  }
}

/** Deletes the file and the data read from it. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await usuarioDelEstudio((await params).id, true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  try {
    const { id, archivoId } = await params;
    await borrarArchivo(id, archivoId);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/h10/archivos]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo borrar" }, { status: 400 });
  }
}
