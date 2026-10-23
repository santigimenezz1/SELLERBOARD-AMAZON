import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { usuarioDelEstudio } from "@/lib/auth/estudios";
import { permitirIA } from "@/lib/auth/limiteInvitado";
import { traducirResenasEstudio } from "@/lib/datos/estudiosH10";
import { volcarConsumo } from "@/lib/datos/consumo";

type Ctx = { params: Promise<{ id: string }> };

// Many reviews can take a couple of minutes to translate.
export const maxDuration = 300;

/** Translates into Spanish the study's competitor reviews that aren't yet (AI). */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await usuarioDelEstudio((await params).id, true);
  if (!user) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const limite = await permitirIA(user, "analisis");
  if (limite) return NextResponse.json({ error: limite }, { status: 429 });
  try {
    const r = await traducirResenasEstudio((await params).id);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[api/h10/traducir]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo traducir" }, { status: 400 });
  }
}
