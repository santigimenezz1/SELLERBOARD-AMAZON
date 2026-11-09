import { NextResponse, type NextRequest } from "next/server";
import { buscarProductos } from "@/lib/datos/calculadora";
import { esCodigoPais } from "@/lib/datos/h10Tipos";
import { fallo, soloDueno } from "../_comun";

/** Products of Amazon's catalog (?pais=ES&q=ASIN, EAN/UPC or words), up to 10. No AI, no Firestore. */
export async function GET(req: NextRequest) {
  const no = await soloDueno();
  if (no) return no;
  const pais = req.nextUrl.searchParams.get("pais");
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!esCodigoPais(pais) || q.length < 2) return NextResponse.json({ error: "Elige la tienda y escribe un ASIN, EAN o título" }, { status: 400 });
  try {
    return NextResponse.json({ productos: await buscarProductos(pais, q) });
  } catch (e) {
    return fallo(e, "No se pudo buscar en el catálogo");
  }
}
