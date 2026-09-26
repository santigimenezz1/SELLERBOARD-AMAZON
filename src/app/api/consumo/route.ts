import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { consumoDeHoy, LIMITE_ESCRITURAS, LIMITE_LECTURAS } from "@/lib/datos/consumo";

/**
 * Today's Firestore usage for the header counter. Served from the in-memory
 * counters: polling it costs no Firestore reads (the session check is local too).
 */
export async function GET() {
  if (!(await getSessionUser())) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  const { lecturas, escrituras } = await consumoDeHoy();
  return NextResponse.json({ lecturas, escrituras, limiteLecturas: LIMITE_LECTURAS, limiteEscrituras: LIMITE_ESCRITURAS });
}
