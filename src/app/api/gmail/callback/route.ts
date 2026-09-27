import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { conectar, origenPublico, sincronizarGmail } from "@/lib/gmail";
import { volcarConsumo } from "@/lib/datos/consumo";

/** Google sends the user back here with a code: stored as a refresh token, then the first read of notifications. */
export async function GET(req: NextRequest) {
  const volver = (error?: string) => {
    const res = NextResponse.redirect(`${origenPublico(req)}/cuenta${error ? `?gmail=${encodeURIComponent(error)}` : ""}`);
    res.cookies.delete({ name: "gmail_estado", path: "/api/gmail" });
    return res;
  };
  if (!(await getSessionUser(true))) return NextResponse.redirect(`${origenPublico(req)}/login`);
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return volver("Permiso denegado en Google");
  const code = p.get("code");
  if (!code || !p.get("state") || p.get("state") !== req.cookies.get("gmail_estado")?.value) return volver("La conexión caducó: vuelve a intentarlo");
  try {
    await conectar(req, code);
    await sincronizarGmail();
    await volcarConsumo().catch(() => {});
    return volver();
  } catch (e) {
    console.error("[gmail/callback]", e);
    return volver(e instanceof Error ? e.message : "No se pudo conectar Gmail");
  }
}
