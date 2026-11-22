import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { subirEnvioWallapop } from "@/lib/datos/wallapop";
import { volcarConsumo } from "@/lib/datos/consumo";

/** Uploads one image. Form data: archivo (the file), tipo (vinted | wallapop | correos). */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await getSessionUser(true);
  if (!user) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  if (user.rol !== "dueno") return NextResponse.json({ error: "No disponible en las cuentas de invitado" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  try {
    const envio = await subirEnvioWallapop(archivo, form?.get("tipo"));
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, envio });
  } catch (e) {
    console.error("[api/wallapop]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo subir" }, { status: 400 });
  }
}
