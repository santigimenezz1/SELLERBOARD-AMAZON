import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { subirDocumento } from "@/lib/datos/documentos";
import { volcarConsumo } from "@/lib/datos/consumo";

/** Uploads a document. Form data: archivo (the file), nombre, carpeta, titulo, fecha (YYYY-MM-DD), nota. */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  try {
    const documento = await subirDocumento(archivo, { nombre: form?.get("nombre"), carpeta: form?.get("carpeta"), fecha: form?.get("fecha"), nota: form?.get("nota"), titulo: form?.get("titulo") });
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, documento });
  } catch (e) {
    console.error("[api/documentos]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo subir" }, { status: 400 });
  }
}
