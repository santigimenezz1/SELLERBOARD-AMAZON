import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { costeTotal, guardarEscandallo } from "@/lib/datos/escandallos";
import { volcarConsumo } from "@/lib/datos/consumo";

/** Saves a product's cost breakdown. Body: { proveedores: [{ id, nombre, piezas: [{ id, nombre, coste }] }], lotes: [{ id, referencia, fecha, unidades, costeTotal }] }. */
export async function PUT(req: NextRequest, { params }: RouteContext<"/api/productos/[asin]/costes">) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const { asin } = await params;
  if (!/^[A-Z0-9]{10}$/.test(asin)) return NextResponse.json({ error: "ASIN no válido" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { proveedores?: unknown; lotes?: unknown };
  try {
    const e = await guardarEscandallo(asin, body.proveedores, body.lotes);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, total: costeTotal(e), actualizadoEn: e.actualizadoEn });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo guardar" }, { status: 400 });
  }
}
