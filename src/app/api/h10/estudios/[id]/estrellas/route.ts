import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { usuarioDelEstudio } from "@/lib/auth/estudios";
import { permitirIA } from "@/lib/auth/limiteInvitado";
import { analizarEstrellas, analizarEstrellasAmbito, estimarEstrellas } from "@/lib/datos/estudiosH10";
import { esCodigoPais } from "@/lib/datos/h10Tipos";
import { volcarConsumo } from "@/lib/datos/consumo";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Has the AI say what the reviews of each star say. Body: { pais, asin } for one competitor, or { ambito } for every
 * competitor of a country («DE»…) or of every country («TODOS»). With { estimar: true }, only how many reviews it would
 * read and about what it would cost (no AI), to ask first.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await usuarioDelEstudio((await params).id, true);
  if (!user) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { pais?: unknown; asin?: unknown; ambito?: unknown; estimar?: unknown };
  const id = (await params).id;
  try {
    if (body.estimar === true) {
      if (body.ambito === "TODOS" || esCodigoPais(body.ambito)) return NextResponse.json(await estimarEstrellas(id, { ambito: body.ambito }));
      if (esCodigoPais(body.pais) && typeof body.asin === "string" && /^B\d[A-Z0-9]{8}$/.test(body.asin)) return NextResponse.json(await estimarEstrellas(id, { pais: body.pais, asin: body.asin }));
      return NextResponse.json({ error: "País o ASIN no válido" }, { status: 400 });
    }
    const limite = await permitirIA(user, "analisis");
    if (limite) return NextResponse.json({ error: limite }, { status: 429 });
    let analizadas: number;
    if (body.ambito === "TODOS" || esCodigoPais(body.ambito)) analizadas = (await analizarEstrellasAmbito(id, body.ambito)).analizadas;
    else if (esCodigoPais(body.pais) && typeof body.asin === "string" && /^B\d[A-Z0-9]{8}$/.test(body.asin)) analizadas = (await analizarEstrellas(id, body.pais, body.asin)).analizadas;
    else return NextResponse.json({ error: "País o ASIN no válido" }, { status: 400 });
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, analizadas });
  } catch (e) {
    console.error("[api/h10/estrellas]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo analizar" }, { status: 400 });
  }
}
