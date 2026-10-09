import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { analizarEstrellas, analizarEstrellasAmbito } from "@/lib/datos/estudiosH10";
import { esCodigoPais } from "@/lib/datos/h10Tipos";
import { volcarConsumo } from "@/lib/datos/consumo";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Has the AI say what the reviews of each star say. Body: { pais, asin } for one competitor, or { ambito } for every
 * competitor of a country («DE»…) or of every country («TODOS»).
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { pais?: unknown; asin?: unknown; ambito?: unknown };
  const id = (await params).id;
  try {
    let analizadas: number;
    if (body.ambito === "TODOS" || esCodigoPais(body.ambito)) analizadas = (await analizarEstrellasAmbito(id, body.ambito)).analizadas;
    else if (esCodigoPais(body.pais) && typeof body.asin === "string" && /^B0[A-Z0-9]{8}$/.test(body.asin)) analizadas = (await analizarEstrellas(id, body.pais, body.asin)).analizadas;
    else return NextResponse.json({ error: "País o ASIN no válido" }, { status: 400 });
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, analizadas });
  } catch (e) {
    console.error("[api/h10/estrellas]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo analizar" }, { status: 400 });
  }
}
