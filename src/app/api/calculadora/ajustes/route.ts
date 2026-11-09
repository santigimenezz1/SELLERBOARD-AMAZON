import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { guardarAjustesCalc } from "@/lib/datos/calculadora";
import { volcarConsumo } from "@/lib/datos/consumo";
import { fallo, soloDueno } from "../_comun";

/** Saves the calculator's settings (storage per m³ per country and season, digital services %). */
export async function PUT(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const no = await soloDueno(true);
  if (no) return no;
  try {
    const ajustes = await guardarAjustesCalc(await req.json().catch(() => ({})));
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ajustes });
  } catch (e) {
    return fallo(e, "No se pudieron guardar los ajustes");
  }
}
