import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { usuarioDelEstudio } from "@/lib/auth/estudios";
import { permitirIA } from "@/lib/auth/limiteInvitado";
import { agruparResenas } from "@/lib/datos/estudiosH10";
import { volcarConsumo } from "@/lib/datos/consumo";

type Ctx = { params: Promise<{ id: string }> };

/** Has the AI put together the competitors' review topics into common themes, with what to improve. */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await usuarioDelEstudio((await params).id, true);
  if (!user) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const limite = await permitirIA(user, "analisis");
  if (limite) return NextResponse.json({ error: limite }, { status: 429 });
  try {
    const resenas = await agruparResenas((await params).id);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, temas: resenas.temas.length });
  } catch (e) {
    console.error("[api/h10/resenas]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo analizar" }, { status: 400 });
  }
}
