import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { guardarContacto } from "@/lib/datos/proveedores";
import { volcarConsumo } from "@/lib/datos/consumo";

/** Saves a supplier's contact details. Body: { nombre, empresa, telefono, email, alibaba }. */
export async function PUT(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const c = await guardarContacto(body);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, contacto: c });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 400 });
  }
}
