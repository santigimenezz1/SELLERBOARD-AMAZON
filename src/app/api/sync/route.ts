import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";
import { isAmazonConfigured } from "@/lib/amazon/cliente";
import { sincronizar, SyncEnCurso } from "@/lib/amazon/sincronizar";

// The first sync can page through months of orders and wait out throttling.
export const maxDuration = 300;

/** "Sincronizar ahora": pulls new orders and financial events from Amazon. */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  if (!(await getSessionUser(true))) {
    return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  }
  if (!isAmazonConfigured) {
    return NextResponse.json({ error: "Faltan las credenciales de Amazon (SPAPI_*) en .env.local" }, { status: 500 });
  }
  try {
    return NextResponse.json(await sincronizar());
  } catch (e) {
    if (e instanceof SyncEnCurso) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("[api/sync]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error inesperado al sincronizar" }, { status: 500 });
  }
}
