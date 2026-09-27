import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { isAmazonConfigured } from "@/lib/amazon/cliente";
import { cargarMarketplaces } from "@/lib/datos/panel";
import { actualizarStock } from "@/lib/datos/stock";
import { volcarConsumo } from "@/lib/datos/consumo";
import { actualizarEnvios } from "@/lib/datos/envios";
import { actualizarInventarioPaises } from "@/lib/datos/inventarioPaises";

/** "Actualizar stock": asks Amazon for the current FBA stock, stock per country and inbound shipments without a full sync. */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  if (!isAmazonConfigured) return NextResponse.json({ error: "Faltan las credenciales de Amazon (SPAPI_*) en .env.local" }, { status: 500 });
  try {
    const marketplaces = await cargarMarketplaces();
    const stock = await actualizarStock(marketplaces);
    const mk = marketplaces.find((m) => m.id === "A1RKKUPIHCS9HS")?.id ?? marketplaces[0]?.id;
    // Shipments and the per-country report (~20 s to build) run side by side; one failing doesn't sink the other.
    const avisos: string[] = [];
    if (mk) {
      const [envios, paises] = await Promise.allSettled([actualizarEnvios(mk), actualizarInventarioPaises(mk, true)]);
      const texto = (r: PromiseRejectedResult) => (r.reason instanceof Error ? r.reason.message : String(r.reason));
      if (envios.status === "rejected") avisos.push(`Envíos: ${texto(envios)}`);
      if (paises.status === "rejected") avisos.push(`Inventario por país: ${texto(paises)}`);
    }
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, actualizadoEn: stock.actualizadoEn, avisos });
  } catch (e) {
    console.error("[api/stock]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo actualizar el stock" }, { status: 500 });
  }
}
