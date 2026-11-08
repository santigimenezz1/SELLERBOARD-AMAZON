import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { usuarioDelEstudio } from "@/lib/auth/estudios";
import { permitirIA } from "@/lib/auth/limiteInvitado";
import { analizarKitsCompetidores } from "@/lib/ia/kitsCompetidores";
import { mensajeError } from "@/lib/ia/errores";
import { volcarConsumo } from "@/lib/datos/consumo";

type Ctx = { params: Promise<{ id: string }> };

/** «Kits competidores»: reads the 20 best sellers of each country and what their kits include (AI), and saves it. */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const id = (await params).id;
  const user = await usuarioDelEstudio(id, true);
  if (!user) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const limite = await permitirIA(user, "analisis");
  if (limite) return NextResponse.json({ error: limite }, { status: 429 });
  try {
    const kits = await analizarKitsCompetidores(id);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, generadoEn: kits.generadoEn });
  } catch (e) {
    console.error("[api/h10/kits]", e);
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 });
  }
}
