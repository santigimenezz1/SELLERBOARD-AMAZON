import "server-only";

import { getSessionUser } from "./session";

/**
 * Demo mode: a guest (accesos.ts), or nobody signed in. The owner's sections then show their layout with no data at
 * all: each page checks this BEFORE loading anything and passes empty values instead.
 */
export async function modoDemo(): Promise<boolean> {
  // Local only, to see the empty sections signed in as the owner (FORZAR_DEMO=1 when starting the dev server).
  if (process.env.NODE_ENV !== "production" && process.env.FORZAR_DEMO === "1") return true;
  return (await getSessionUser())?.rol !== "dueno";
}
