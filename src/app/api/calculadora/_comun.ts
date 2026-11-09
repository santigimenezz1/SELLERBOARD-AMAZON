import "server-only";

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";

/** The calculator asks Amazon with the owner's keys: only the owner uses it. Null when allowed, else the answer. */
export async function soloDueno(revocacion = false): Promise<NextResponse | null> {
  const u = await getSessionUser(revocacion);
  if (!u) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  if (u.rol !== "dueno") return NextResponse.json({ error: "Solo el dueño de la cuenta puede usar la calculadora" }, { status: 403 });
  return null;
}

export const fallo = (e: unknown, por: string) => {
  console.error("[api/calculadora]", e);
  return NextResponse.json({ error: e instanceof Error ? e.message : por }, { status: 400 });
};
