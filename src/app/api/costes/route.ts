import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { guardarCoste } from "@/lib/datos/costes";

/** Sets the unit cost of one SKU. Body: { sku, costeUnitario }. */
export async function PUT(req: NextRequest) {
  if (!mismoOrigen(req)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  if (!(await getSessionUser(true))) {
    return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  }
  const { sku, costeUnitario } = (await req.json().catch(() => ({}))) as { sku?: unknown; costeUnitario?: unknown };
  if (typeof sku !== "string" || !sku) {
    return NextResponse.json({ error: "Falta el SKU" }, { status: 400 });
  }
  if (typeof costeUnitario !== "number" || !Number.isFinite(costeUnitario) || costeUnitario < 0 || costeUnitario > 100_000) {
    return NextResponse.json({ error: "El coste debe ser un número positivo" }, { status: 400 });
  }
  try {
    return NextResponse.json(await guardarCoste(sku, costeUnitario));
  } catch (e) {
    console.error("[api/costes]", e);
    return NextResponse.json({ error: "No se pudo guardar el coste" }, { status: 500 });
  }
}
