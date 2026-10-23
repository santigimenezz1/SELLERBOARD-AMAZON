import { NextResponse, type NextRequest } from "next/server";
import { usuarioDelEstudio } from "@/lib/auth/estudios";
import { realidadLanzamiento } from "@/lib/datos/h10Realidad";

type Ctx = { params: Promise<{ id: string }> };

/** The report's forecast against the real sales of the owner's launched product. Owners only: it reads their orders. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const id = (await params).id;
  const user = await usuarioDelEstudio(id, true);
  if (!user) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  if (user.rol !== "dueno") return NextResponse.json({ error: "No disponible en esta cuenta" }, { status: 403 });
  try {
    return NextResponse.json({ realidad: await realidadLanzamiento(id) });
  } catch (e) {
    console.error("[api/h10/realidad]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo calcular" }, { status: 500 });
  }
}
