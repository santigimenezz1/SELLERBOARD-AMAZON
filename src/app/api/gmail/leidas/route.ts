import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { guardarGmail, obtenerGmail } from "@/lib/datos/notificaciones";
import { volcarConsumo } from "@/lib/datos/consumo";

/** Marks notifications as read (this app's own flag; Gmail isn't touched). Body: { ids: string[] }. One write. */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 2000) : [];
  const doc = await obtenerGmail();
  const notificaciones = { ...doc.notificaciones };
  for (const id of ids) if (notificaciones[id]) notificaciones[id] = { ...notificaciones[id], leida: true };
  await guardarGmail({ notificaciones });
  await volcarConsumo().catch(() => {});
  return NextResponse.json({ ok: true });
}
