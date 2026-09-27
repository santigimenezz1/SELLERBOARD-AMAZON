import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { pedidosEnAlmacen } from "@/lib/datos/almacen";
import { avisarVentas } from "@/lib/telegram";
import { volcarConsumo } from "@/lib/datos/consumo";

/** Sends test sales notices (built from the 3 latest real orders) to check the bot and the ringtone. */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  try {
    const lineas = [...pedidosEnAlmacen().values()].filter((p) => p.estado !== "CANCELLED").sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
    const ultimos = new Set(lineas.map((l) => l.amazonOrderId).filter((id, i, xs) => xs.indexOf(id) === i).slice(0, 3));
    if (ultimos.size === 0) return NextResponse.json({ error: "No hay pedidos todavía" }, { status: 400 });
    await avisarVentas(lineas.filter((l) => ultimos.has(l.amazonOrderId)));
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo enviar" }, { status: 500 });
  }
}
