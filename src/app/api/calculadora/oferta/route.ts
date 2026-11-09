import { NextResponse, type NextRequest } from "next/server";
import { ofertaDe } from "@/lib/datos/calculadora";
import { esCodigoPais } from "@/lib/datos/h10Tipos";
import { fallo, soloDueno } from "../_comun";

/** The featured offer of an ASIN (?pais=ES&asin=B0…): price with shipping, offers, whether Amazon ships it. */
export async function GET(req: NextRequest) {
  const no = await soloDueno();
  if (no) return no;
  const pais = req.nextUrl.searchParams.get("pais");
  const asin = (req.nextUrl.searchParams.get("asin") ?? "").toUpperCase();
  if (!esCodigoPais(pais) || !/^[A-Z0-9]{10}$/.test(asin)) return NextResponse.json({ error: "País o ASIN no válido" }, { status: 400 });
  try {
    return NextResponse.json({ oferta: await ofertaDe(pais, asin) });
  } catch (e) {
    return fallo(e, "No se pudo leer la oferta");
  }
}
