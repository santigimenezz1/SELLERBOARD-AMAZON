import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { subirArchivo } from "@/lib/datos/estudiosH10";
import { esCodigoPais, esHerramienta } from "@/lib/datos/h10Tipos";
import { volcarConsumo } from "@/lib/datos/consumo";

type Ctx = { params: Promise<{ id: string }> };

/** Uploads a Helium 10 file (CSV or screenshot) to a study and reads it. Form data: archivo, pais and herramienta (optional hints). */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  const pais = form?.get("pais");
  const herramienta = form?.get("herramienta");
  try {
    const subido = await subirArchivo((await params).id, archivo, { codigoPais: esCodigoPais(pais) ? pais : null, herramienta: esHerramienta(herramienta) ? herramienta : null });
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, archivo: subido });
  } catch (e) {
    console.error("[api/h10/archivos]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo subir" }, { status: 400 });
  }
}
