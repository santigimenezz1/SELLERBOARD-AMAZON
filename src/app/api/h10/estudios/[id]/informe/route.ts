import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { usuarioDelEstudio } from "@/lib/auth/estudios";
import { estadoInforme, lanzarInforme, modoAgente } from "@/lib/ia/agenteInforme";
import { historialInformes, informeVersion } from "@/lib/datos/estudiosH10";
import { esCodigoPais } from "@/lib/datos/h10Tipos";

type Ctx = { params: Promise<{ id: string }> };

/** Starts the research agent on a study, only when the owner asks for it. It works in the background. */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await usuarioDelEstudio((await params).id, true);
  if (!user) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  // `{ prueba: { pais } }`: a real, cheap test on one country (Sonnet, with a spending cap).
  const cuerpo = (await req.json().catch(() => ({}))) as { prueba?: { pais?: unknown } };
  const pais = cuerpo.prueba?.pais;
  if (cuerpo.prueba && !esCodigoPais(pais)) return NextResponse.json({ error: "País no válido" }, { status: 400 });
  // A real report costs dollars of the owners' credits: not for guests.
  if (user.rol === "invitado" && (modoAgente() === "real" || cuerpo.prueba)) return NextResponse.json({ error: "El informe con IA no está disponible en las cuentas de invitado" }, { status: 403 });
  try {
    return NextResponse.json({ estado: lanzarInforme((await params).id, esCodigoPais(pais) ? { paises: [pais] } : undefined) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo empezar" }, { status: 409 });
  }
}

/**
 * How the agent is getting on (null when it isn't running nor ran recently), and the mode it would run in.
 * `?historial=1`: every report made for the study (headings only); `?version=…`: one of them, whole.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const id = (await params).id;
  if (!(await usuarioDelEstudio(id, true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  try {
    if (sp.get("historial")) return NextResponse.json({ historial: await historialInformes(id) });
    const version = sp.get("version");
    if (version) {
      const informe = await informeVersion(id, version);
      return informe ? NextResponse.json({ informe }) : NextResponse.json({ error: "Esa versión del informe no existe" }, { status: 404 });
    }
    return NextResponse.json({ estado: await estadoInforme(id), modo: modoAgente() });
  } catch (e) {
    console.error("[api/h10/informe]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer" }, { status: 500 });
  }
}
