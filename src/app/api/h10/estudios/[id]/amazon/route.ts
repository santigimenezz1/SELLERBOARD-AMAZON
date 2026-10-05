import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { asinManual, traerCompetidorAmazon } from "@/lib/datos/estudiosH10";
import { isAmazonConfigured } from "@/lib/amazon/cliente";
import { volcarConsumo } from "@/lib/datos/consumo";

type Ctx = { params: Promise<{ id: string }> };

const comprobar = async (req: NextRequest) => {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  if (!isAmazonConfigured) return NextResponse.json({ error: "Faltan las credenciales de Amazon" }, { status: 500 });
  return null;
};

/** Reads one competitor ASIN in one country from Amazon (catalog, offers, fees). Body: { asin, pais }. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const no = await comprobar(req);
  if (no) return no;
  const cuerpo = (await req.json().catch(() => ({}))) as { asin?: unknown; pais?: unknown };
  try {
    const ficha = await traerCompetidorAmazon((await params).id, cuerpo.asin, cuerpo.pais);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, ficha });
  } catch (e) {
    console.error("[api/h10/amazon]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Amazon no respondió" }, { status: 400 });
  }
}

/** Adds or removes an ASIN of the follow-up by hand. Body: { asin, accion: "agregar" | "quitar" }. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const no = await comprobar(req);
  if (no) return no;
  const cuerpo = (await req.json().catch(() => ({}))) as { asin?: unknown; accion?: unknown };
  try {
    await asinManual((await params).id, cuerpo.asin, cuerpo.accion === "quitar" ? "quitar" : "agregar");
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 400 });
  }
}
