import type { BloqueInforme, InformeEstrategico } from "./h10Tipos";

/*
 * What changed from one version of a study's report to another, in words: the verdict, the headline, the sections,
 * the headline figures, the keywords to bid on and the specialists' key decisions. Pure: the page shows it.
 */

const VEREDICTO: Record<InformeEstrategico["veredicto"], string> = { lanzar: "lanzar", validar: "validar", descartar: "descartar" };
const MAX_CIFRAS = 15;

/** «Sección · etiqueta» → value of every headline figure. */
function cifras(i: InformeEstrategico): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of i.secciones) for (const b of s.bloques) if (b.tipo === "cifras") for (const x of b.items) m.set(`${s.etiqueta} · ${x.etiqueta}`, x.valor);
  return m;
}

/** The keywords of each verdict («atacar», «probar», «evitar»). */
function palabras(i: InformeEstrategico): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const s of i.secciones)
    for (const b of s.bloques as BloqueInforme[])
      if (b.tipo === "palabras") for (const x of b.items) (m.get(x.veredicto) ?? m.set(x.veredicto, new Set()).get(x.veredicto)!).add(x.texto.toLowerCase());
  return m;
}

const fmt = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 2 });

/** From `antes` (an older version) to `ahora`. */
export function cambiosInforme(antes: InformeEstrategico, ahora: InformeEstrategico): string[] {
  const salida: string[] = [];
  if (antes.veredicto !== ahora.veredicto) salida.push(`**Veredicto:** «${VEREDICTO[antes.veredicto]}» → «${VEREDICTO[ahora.veredicto]}».`);
  const titular = (i: InformeEstrategico) => `${i.titular} ${i.titularDestacado}`.trim();
  if (titular(antes) !== titular(ahora)) salida.push(`**Titular:** «${titular(antes)}» → «${titular(ahora)}».`);

  const secA = new Map(antes.secciones.map((s) => [s.id, s.etiqueta]));
  const secB = new Map(ahora.secciones.map((s) => [s.id, s.etiqueta]));
  const nuevas = [...secB].filter(([id]) => !secA.has(id)).map(([, e]) => e);
  const quitadas = [...secA].filter(([id]) => !secB.has(id)).map(([, e]) => e);
  if (nuevas.length) salida.push(`**Secciones nuevas:** ${nuevas.join(", ")}.`);
  if (quitadas.length) salida.push(`**Secciones que ya no están:** ${quitadas.join(", ")}.`);

  const ca = cifras(antes);
  const cb = cifras(ahora);
  const cambiadas = [...cb].filter(([k, v]) => ca.has(k) && ca.get(k) !== v).map(([k, v]) => `${k}: ${ca.get(k)} → **${v}**`);
  const aparecen = [...cb].filter(([k]) => !ca.has(k)).map(([k, v]) => `${k}: **${v}** (nueva)`);
  const lista = [...cambiadas, ...aparecen];
  if (lista.length) salida.push(`**Cifras:** ${lista.slice(0, MAX_CIFRAS).join(" · ")}${lista.length > MAX_CIFRAS ? ` · y ${lista.length - MAX_CIFRAS} más` : ""}.`);

  const pa = palabras(antes);
  const pb = palabras(ahora);
  for (const v of ["atacar", "probar", "evitar"]) {
    const a = pa.get(v) ?? new Set<string>();
    const b = pb.get(v) ?? new Set<string>();
    const entran = [...b].filter((x) => !a.has(x));
    const salen = [...a].filter((x) => !b.has(x));
    if (entran.length || salen.length) salida.push(`**Palabras clave para ${v}:** ${entran.length ? `entran ${entran.slice(0, 6).map((x) => `«${x}»`).join(", ")}` : ""}${entran.length && salen.length ? "; " : ""}${salen.length ? `salen ${salen.slice(0, 6).map((x) => `«${x}»`).join(", ")}` : ""}.`);
  }

  // The specialists' decisions (reports made since they hand them in).
  const decisiones = (i: InformeEstrategico) => new Map((i.trabajo?.analisis ?? []).map((a) => [a.especialista, a.decisiones ?? {}]));
  const da = decisiones(antes);
  for (const [quien, b] of decisiones(ahora)) {
    const a = da.get(quien);
    if (!a) continue;
    const cambios = [
      a.paisPrincipal && b.paisPrincipal && a.paisPrincipal !== b.paisPrincipal ? `país ${a.paisPrincipal} → ${b.paisPrincipal}` : "",
      a.precioEur !== undefined && b.precioEur !== undefined && a.precioEur !== b.precioEur ? `precio ${fmt(a.precioEur)} € → ${fmt(b.precioEur)} €` : "",
      a.ventasMesPrimerAno !== undefined && b.ventasMesPrimerAno !== undefined && a.ventasMesPrimerAno !== b.ventasMesPrimerAno ? `ventas/mes ${fmt(a.ventasMesPrimerAno)} → ${fmt(b.ventasMesPrimerAno)}` : "",
    ].filter(Boolean);
    if (cambios.length) salida.push(`**${quien}:** ${cambios.join(" · ")}.`);
  }

  if (antes.coste.dolares !== ahora.coste.dolares) salida.push(`**Coste:** ${fmt(antes.coste.dolares)} $ → ${fmt(ahora.coste.dolares)} $.`);
  return salida.length ? salida : ["Mismo veredicto, mismas cifras y mismas palabras clave."];
}
