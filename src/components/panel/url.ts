/**
 * Dashboard URL state: `p` selected tile, `e` extra period tile (7d / 30d /
 * rango + desde/hasta), `pais` marketplace filter. Changing one keeps the rest.
 */
export type EstadoUrl = { p: string; e: string | null; desde: string | null; hasta: string | null; pais: string | null };

export function urlPanel(base: string, estado: EstadoUrl, cambios: Partial<EstadoUrl>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...estado, ...cambios })) if (v) q.set(k, v);
  // "hoy" is the default tile: keep the URL clean.
  if (q.get("p") === "hoy") q.delete("p");
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
