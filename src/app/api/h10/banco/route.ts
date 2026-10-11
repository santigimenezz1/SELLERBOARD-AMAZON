import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { ejecutarBanco, listarBanco } from "@/lib/ia/bancoPruebas";

/** The test bench's runs so far, newest first. */
export async function GET() {
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  return NextResponse.json({ historial: await listarBanco() });
}

/** Runs the bench on a study: the checker always; the reviewer (it costs) only with «conRevisor», at the «nivel» given. */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { estudioId?: unknown; conRevisor?: unknown; nivel?: unknown };
  if (typeof b.estudioId !== "string") return NextResponse.json({ error: "Falta el estudio" }, { status: 400 });
  try {
    const prueba = await ejecutarBanco(b.estudioId, b.conRevisor === true, b.nivel === "dificil" ? "dificil" : "normal");
    return NextResponse.json({ prueba, historial: await listarBanco() });
  } catch (e) {
    console.error("[banco]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo hacer la prueba" }, { status: 500 });
  }
}
