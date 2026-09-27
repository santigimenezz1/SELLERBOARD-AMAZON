import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { sincronizarGmail } from "@/lib/gmail";
import { volcarConsumo } from "@/lib/datos/consumo";

/** «Actualizar» in the notifications tab: reads new Amazon notifications from Gmail. */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  try {
    const nuevas = await sincronizarGmail();
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, nuevas });
  } catch (e) {
    console.error("[gmail/sincronizar]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer Gmail" }, { status: 500 });
  }
}
