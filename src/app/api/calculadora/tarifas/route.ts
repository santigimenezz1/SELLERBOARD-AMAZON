import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { tarifasDetalle } from "@/lib/amazon/apis";
import { MERCADOS_CALC } from "@/lib/datos/calculadora";
import { esCodigoPais } from "@/lib/datos/h10Tipos";
import { fallo, soloDueno } from "../_comun";

/** Amazon's fees (FBA) of an ASIN at a price, one by one. Body: { pais, asin, precio }. */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const no = await soloDueno();
  if (no) return no;
  const b = (await req.json().catch(() => ({}))) as { pais?: unknown; asin?: unknown; precio?: unknown };
  const asin = typeof b.asin === "string" ? b.asin.toUpperCase() : "";
  if (!esCodigoPais(b.pais) || !/^[A-Z0-9]{10}$/.test(asin)) return NextResponse.json({ error: "País o ASIN no válido" }, { status: 400 });
  if (typeof b.precio !== "number" || !(b.precio > 0) || b.precio > 100000) return NextResponse.json({ error: "Precio no válido" }, { status: 400 });
  const m = MERCADOS_CALC[b.pais];
  try {
    return NextResponse.json({ tarifas: await tarifasDetalle(asin, m.id, Math.round(b.precio * 100) / 100, m.moneda) });
  } catch (e) {
    return fallo(e, "No se pudieron calcular las tarifas");
  }
}
