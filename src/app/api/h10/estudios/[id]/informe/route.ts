import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { generarInforme } from "@/lib/datos/estudiosH10";

type Ctx = { params: Promise<{ id: string }> };

/** Generates the niche report of a study, only when the owner asks for it. */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  try {
    await generarInforme((await params).id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/h10/informe]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo generar el informe" }, { status: 400 });
  }
}
