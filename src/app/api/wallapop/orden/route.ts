import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { reordenarEnviosWallapop } from "@/lib/datos/wallapop";
import { volcarConsumo } from "@/lib/datos/consumo";

/** New order of a carrier's cards after dragging one. Body: { ids: string[] } in the new order. */
export async function PUT(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await getSessionUser(true);
  if (!user) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  if (user.rol !== "dueno") return NextResponse.json({ error: "No disponible en las cuentas de invitado" }, { status: 403 });
  const cuerpo = (await req.json().catch(() => ({}))) as { ids?: unknown };
  try {
    await reordenarEnviosWallapop(cuerpo.ids);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 400 });
  }
}
