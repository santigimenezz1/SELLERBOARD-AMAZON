import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { getSessionUser } from "@/lib/auth/session";
import { gmailConfigurado } from "@/lib/datos/notificaciones";
import { origenPublico, urlAutorizacion } from "@/lib/gmail";

/** «Conectar Gmail»: sends the (signed-in) user to Google's consent screen; a random state cookie guards the callback. */
export async function GET(req: NextRequest) {
  if (!(await getSessionUser(true))) return NextResponse.redirect(`${origenPublico(req)}/login`);
  if (!gmailConfigurado) return NextResponse.json({ error: "Falta GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" }, { status: 500 });
  const estado = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(urlAutorizacion(req, estado));
  res.cookies.set("gmail_estado", estado, { httpOnly: true, secure: origenPublico(req).startsWith("https"), sameSite: "lax", path: "/api/gmail", maxAge: 600 });
  return res;
}
