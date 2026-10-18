import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { usuarioDelEstudio } from "@/lib/auth/estudios";
import { cargarListingsAmazon } from "@/lib/datos/estudiosH10";
import { isAmazonConfigured } from "@/lib/amazon/cliente";
import { volcarConsumo } from "@/lib/datos/consumo";
import { mensajeError } from "@/lib/ia/errores";

type Ctx = { params: Promise<{ id: string }> };

/** Loads the leaders' listings of one country from Amazon's catalog («Cargar datos»). Body: { pais }. */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await usuarioDelEstudio((await params).id, true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  if (!isAmazonConfigured) return NextResponse.json({ error: "Faltan las credenciales de Amazon" }, { status: 500 });
  const cuerpo = (await req.json().catch(() => ({}))) as { pais?: unknown };
  try {
    const listings = await cargarListingsAmazon((await params).id, cuerpo.pais);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, listings: listings.map((l) => ({ asin: l.asin, marca: l.marca, fotos: l.fotos.length })) });
  } catch (e) {
    console.error("[api/h10/listings]", e);
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 });
  }
}
