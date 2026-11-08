import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { usuarioDelEstudio } from "@/lib/auth/estudios";
import { permitirIA } from "@/lib/auth/limiteInvitado";
import { analizarKitsCompetidores } from "@/lib/ia/kitsCompetidores";
import { mensajeError } from "@/lib/ia/errores";
import { volcarConsumo } from "@/lib/datos/consumo";
import { esCodigoPais } from "@/lib/datos/h10Tipos";

type Ctx = { params: Promise<{ id: string }> };

/**
 * «Kits competidores»: reads the listings asked for (body { pares: [{ pais, asin }] }, up to 100) and what their kits
 * include (AI), and saves it with what was read before.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const id = (await params).id;
  const user = await usuarioDelEstudio(id, true);
  if (!user) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { pares?: unknown };
  const pares = (Array.isArray(body.pares) ? body.pares : [])
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {}))
    .filter((p): p is { pais: "ES" | "DE" | "FR" | "IT" | "GB"; asin: string } => esCodigoPais(p.pais) && typeof p.asin === "string" && /^B\d[A-Z0-9]{8}$/.test(p.asin))
    .slice(0, 100);
  if (!pares.length) return NextResponse.json({ error: "No hay listings que analizar" }, { status: 400 });
  const limite = await permitirIA(user, "analisis");
  if (limite) return NextResponse.json({ error: limite }, { status: 429 });
  try {
    const kits = await analizarKitsCompetidores(id, pares);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, generadoEn: kits.generadoEn });
  } catch (e) {
    console.error("[api/h10/kits]", e);
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 });
  }
}
