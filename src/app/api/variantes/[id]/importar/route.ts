import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { isAmazonConfigured } from "@/lib/amazon/cliente";
import { importarListing } from "@/lib/datos/variantes";
import { volcarConsumo } from "@/lib/datos/consumo";

type Ctx = { params: Promise<{ id: string }> };

/** Brings one of your listings from Amazon onto the board, with its variants. Body: { asin }. */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  if (!isAmazonConfigured) return NextResponse.json({ error: "Falta la conexión con Amazon" }, { status: 400 });
  try {
    const cuantos = await importarListing((await params).id, ((await req.json().catch(() => ({}))) as { asin?: unknown }).asin);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, cuantos });
  } catch (e) {
    console.error("[api/variantes/importar]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo importar" }, { status: 400 });
  }
}
