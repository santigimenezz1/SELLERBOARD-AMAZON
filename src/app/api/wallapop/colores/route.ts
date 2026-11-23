import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { fijarColorProducto } from "@/lib/datos/wallapop";
import { volcarConsumo } from "@/lib/datos/consumo";

/** Color of a product's box on the cards. Body: { producto, color: "#rrggbb" | null }. */
export async function PUT(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await getSessionUser(true);
  if (!user) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  if (user.rol !== "dueno") return NextResponse.json({ error: "No disponible en las cuentas de invitado" }, { status: 403 });
  const cuerpo = (await req.json().catch(() => ({}))) as { producto?: unknown; color?: unknown };
  try {
    const colores = await fijarColorProducto(cuerpo.producto, cuerpo.color ?? null);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, colores });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 400 });
  }
}
