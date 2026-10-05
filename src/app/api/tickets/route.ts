import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { subirTicket } from "@/lib/datos/tickets";
import { volcarConsumo } from "@/lib/datos/consumo";

/** Uploads a ticket and has the AI read it. Form data: archivo (the photo or PDF). */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const archivo = (await req.formData().catch(() => null))?.get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  try {
    const ticket = await subirTicket(archivo);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, ticket });
  } catch (e) {
    console.error("[api/tickets]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo subir" }, { status: 400 });
  }
}
