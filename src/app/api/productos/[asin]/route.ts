import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { isAmazonConfigured } from "@/lib/amazon/cliente";
import { cargarMarketplaces, cargarUltimaSync } from "@/lib/datos/panel";
import { datosVentas } from "@/lib/datos/almacen";
import { actualizarFichas } from "@/lib/datos/fichas";
import { volcarConsumo } from "@/lib/datos/consumo";

/** "Actualizar ficha": fresh catalog card and prices for one ASIN, in every marketplace with sales. */
export async function POST(req: NextRequest, { params }: RouteContext<"/api/productos/[asin]">) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  if (!isAmazonConfigured) return NextResponse.json({ error: "Faltan las credenciales de Amazon" }, { status: 500 });
  const { asin } = await params;
  if (!/^[A-Z0-9]{10}$/.test(asin)) return NextResponse.json({ error: "ASIN no válido" }, { status: 400 });
  try {
    const [marketplaces, ultima] = await Promise.all([cargarMarketplaces(), cargarUltimaSync()]);
    const { lineas } = await datosVentas(ultima?.id ?? null);
    const conVentas = new Set(lineas.map((l) => l.marketplaceId));
    const escritas = await actualizarFichas(
      marketplaces.filter((m) => conVentas.has(m.id)),
      { forzar: true, soloAsins: [asin] },
    );
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, escritas });
  } catch (e) {
    console.error("[api/productos]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo actualizar la ficha" }, { status: 500 });
  }
}
