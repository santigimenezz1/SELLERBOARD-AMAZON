import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { idUltimaSync } from "@/lib/datos/panel";

/** Id of the latest sync, polled by open pages to reload when new data arrives. Served from memory. */
export async function GET() {
  if (!(await getSessionUser())) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  return NextResponse.json({ id: await idUltimaSync() });
}
