import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { borrarCarpeta, crearCarpeta, renombrarCarpeta } from "@/lib/datos/documentos";
import { volcarConsumo } from "@/lib/datos/consumo";

/** Folders of «Documentos». POST { nombre } creates one, PATCH { id, nombre } renames it, DELETE { id } deletes an empty one. */
async function manejar(req: NextRequest, accion: (b: Record<string, unknown>) => Promise<unknown>) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  try {
    const resultado = await accion((await req.json().catch(() => ({}))) as Record<string, unknown>);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, resultado: resultado ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 400 });
  }
}

export const POST = (req: NextRequest) => manejar(req, (b) => crearCarpeta(b.nombre));
export const PATCH = (req: NextRequest) => manejar(req, (b) => renombrarCarpeta(String(b.id ?? ""), b.nombre));
export const DELETE = (req: NextRequest) => manejar(req, (b) => borrarCarpeta(String(b.id ?? "")));
