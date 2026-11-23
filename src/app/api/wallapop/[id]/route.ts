import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { bytesEnvioWallapop, borrarEnvioWallapop, editarEnvioWallapop, enlaceEnvioWallapop } from "@/lib/datos/wallapop";
import { volcarConsumo } from "@/lib/datos/consumo";

type Ctx = { params: Promise<{ id: string }> };

/** Shows the image through a short-lived signed link. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const user = await getSessionUser(true);
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (user.rol !== "dueno") return NextResponse.json({ error: "No disponible" }, { status: 403 });
  try {
    const id = (await params).id;
    // `?bytes=1`: the file from this same site (a PDF is drawn in the browser from it).
    if (req.nextUrl.searchParams.get("bytes") === "1") {
      const { datos, contentType } = await bytesEnvioWallapop(id);
      return new NextResponse(new Uint8Array(datos), { headers: { "content-type": contentType, "content-disposition": "inline", "cache-control": "private, max-age=600" } });
    }
    return NextResponse.redirect(await enlaceEnvioWallapop(id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo abrir" }, { status: 404 });
  }
}

async function permitido(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const user = await getSessionUser(true);
  if (!user) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  if (user.rol !== "dueno") return NextResponse.json({ error: "No disponible en las cuentas de invitado" }, { status: 403 });
  return null;
}

/** Body: any of { entregado: boolean, tipo, nombre }. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const no = await permitido(req);
  if (no) return no;
  try {
    const envio = await editarEnvioWallapop((await params).id, (await req.json().catch(() => ({}))) as Record<string, unknown>);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, envio });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const no = await permitido(req);
  if (no) return no;
  try {
    await borrarEnvioWallapop((await params).id);
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/wallapop]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo borrar" }, { status: 400 });
  }
}
