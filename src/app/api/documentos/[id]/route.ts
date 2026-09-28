import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { borrarDocumento, editarDocumento, enlaceDocumento } from "@/lib/datos/documentos";
import { volcarConsumo } from "@/lib/datos/consumo";

type Ctx = { params: Promise<{ id: string }> };

/** Opens the file (`?descargar=1` downloads it) through a short-lived signed link. */
export async function GET(req: NextRequest, { params }: Ctx) {
  if (!(await getSessionUser(true))) return NextResponse.redirect(new URL("/login", req.url));
  try {
    const url = await enlaceDocumento((await params).id, req.nextUrl.searchParams.get("descargar") === "1");
    return NextResponse.redirect(url);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo abrir" }, { status: 404 });
  }
}

/** Changes name, folder, date or note. Body: any of { nombre, carpeta, fecha, nota }. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  try {
    const documento = await editarDocumento((await params).id, (await req.json().catch(() => ({}))) as Record<string, unknown>);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, documento });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  try {
    await borrarDocumento((await params).id);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/documentos]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo borrar" }, { status: 400 });
  }
}
