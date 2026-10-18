import "server-only";

import { estudioVisible } from "@/lib/datos/estudiosH10";
import { getSessionUser, type SessionUser } from "./session";

/**
 * The signed-in user, only if this study is theirs to see (a guest's own, or the owners' shared ones): else null,
 * as if not signed in. For every route and page of one study.
 */
export async function usuarioDelEstudio(id: string, comprobarRevocacion = false): Promise<SessionUser | null> {
  const user = await getSessionUser(comprobarRevocacion);
  return user && (await estudioVisible(id, user)) ? user : null;
}
