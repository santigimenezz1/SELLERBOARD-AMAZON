import { NextResponse, type NextRequest } from "next/server";
import { claveValida } from "@/lib/datos/claveExtension";
import { estudiosParaVista } from "@/lib/datos/estudiosH10";
import { esCodigoPais } from "@/lib/datos/h10Tipos";

/**
 * Which studies an Amazon product belongs to, for the review-recorder extension: those whose Xray of that country
 * lists the ASIN, or whose loaded listing has it as a variation. Signed with the extension's key. Query: pais, asin.
 */
export async function GET(req: NextRequest) {
  if (!(await claveValida(req.headers.get("authorization")))) return NextResponse.json({ error: "Clave no válida: cópiala otra vez desde la app (Listings → Conectar extensión)" }, { status: 401 });
  const pais = req.nextUrl.searchParams.get("pais")?.toUpperCase() ?? "";
  const asin = req.nextUrl.searchParams.get("asin")?.toUpperCase() ?? "";
  if (!esCodigoPais(pais) || !/^[A-Z0-9]{10}$/.test(asin)) return NextResponse.json({ error: "País o ASIN no válido" }, { status: 400 });
  const estudios = (await estudiosParaVista())
    .map(({ estudio: e }) => {
      const m = e.mercados.find((x) => x.codigoPais === pais);
      const enXray = m?.competidores.find((c) => c.asin === asin);
      // A variation of a leader whose listing was loaded: its reviews go to that leader's ASIN.
      const familia = e.listings?.find((l) => l.codigoPais === pais && l.familia.includes(asin));
      if (!enXray && !familia) return null;
      return { estudioId: e.id, nombre: e.nombre, asin: enXray ? asin : familia!.asin, facturacion: enXray?.facturacion ?? 0 };
    })
    .filter((x) => x !== null)
    .sort((a, b) => b.facturacion - a.facturacion);
  return NextResponse.json({ estudios });
}
