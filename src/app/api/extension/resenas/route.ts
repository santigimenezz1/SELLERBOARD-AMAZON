import { NextResponse, type NextRequest } from "next/server";
import { claveValida } from "@/lib/datos/claveExtension";
import { guardarResenasExtension } from "@/lib/datos/estudiosH10";
import { volcarConsumo } from "@/lib/datos/consumo";
import { mensajeError } from "@/lib/ia/errores";

/**
 * Reviews from the review-recorder browser extension, signed with its key (`Authorization: Bearer <key>`, no
 * session: it runs on Amazon's pages). Body: { estudioId, pais, asin, resenas: [...] }.
 */
export async function POST(req: NextRequest) {
  if (!(await claveValida(req.headers.get("authorization")))) return NextResponse.json({ error: "Clave no válida: cópiala otra vez desde la app (Listings → Conectar extensión)" }, { status: 401 });
  const cuerpo = (await req.json().catch(() => ({}))) as { estudioId?: unknown; pais?: unknown; asin?: unknown; resenas?: unknown };
  try {
    if (typeof cuerpo.estudioId !== "string" || !cuerpo.estudioId) throw new Error("Falta el estudio");
    const archivo = await guardarResenasExtension(cuerpo.estudioId, cuerpo.pais, cuerpo.asin, cuerpo.resenas);
    await volcarConsumo().catch(() => {});
    if (archivo.estado === "error") throw new Error(archivo.error ?? "La app no pudo leer las reseñas");
    return NextResponse.json({ ok: true, resumen: archivo.resumen });
  } catch (e) {
    console.error("[api/extension/resenas]", e);
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 });
  }
}
