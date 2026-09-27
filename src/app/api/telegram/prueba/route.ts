import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { pedidosEnAlmacen } from "@/lib/datos/almacen";
import { avisarVentas, enviarTelegram } from "@/lib/telegram";
import { volcarConsumo } from "@/lib/datos/consumo";

/** Sends a test sales notice (built from the latest real order) to check the bot and the ringtone. */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  try {
    const lineas = [...pedidosEnAlmacen().values()].filter((p) => p.estado !== "CANCELLED").sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
    const ultimo = lineas[0];
    if (!ultimo) return NextResponse.json({ error: "No hay pedidos todavía" }, { status: 400 });
    await enviarTelegram("🔔 <b>Prueba</b>: así te llegará cada venta nueva 👇");
    await avisarVentas(lineas.filter((l) => l.amazonOrderId === ultimo.amazonOrderId));
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo enviar" }, { status: 500 });
  }
}
