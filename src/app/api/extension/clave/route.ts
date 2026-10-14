import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { claveExtension } from "@/lib/datos/claveExtension";

/** The review-recorder extension's key, for the owner to paste into it. Body: { nueva?: true } makes a new one. */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const cuerpo = (await req.json().catch(() => ({}))) as { nueva?: unknown };
  return NextResponse.json({ clave: await claveExtension(cuerpo.nueva === true) });
}
