import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { estadoInforme, lanzarInforme, modoAgente } from "@/lib/ia/agenteInforme";

type Ctx = { params: Promise<{ id: string }> };

/** Starts the research agent on a study, only when the owner asks for it. It works in the background. */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  return NextResponse.json({ estado: lanzarInforme((await params).id) });
}

/** How the agent is getting on (null when it isn't running nor ran recently), and the mode it would run in. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  return NextResponse.json({ estado: estadoInforme((await params).id), modo: modoAgente() });
}
