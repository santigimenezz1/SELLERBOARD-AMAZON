"use client";


import type { CodigoPais, EstudioH10 } from "@/lib/datos/h10Tipos";
import { nombrePais } from "@/lib/datos/h10Analisis";
import { plural, repartoKits, type GrupoKit } from "@/lib/datos/h10Kits";
import { formatNumero } from "@/lib/format";
import { Pais, Seccion, Tarjeta, usePaisEstudio } from "./comun";
import { useCuantosListings } from "./PestanaKits";

const euros = (v: number) => `${formatNumero(Math.round(v))} €`;
const precio = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const pct = (v: number) => `${Math.round(v * 100)} %`;
const lista = (v: string[]) => (v.length > 1 ? `${v.slice(0, -1).join(", ")} y ${v.at(-1)}` : (v[0] ?? ""));
/** The sizes shown one by one; the rest go together as «Otros tamaños». */
const MAX_GRUPOS = 6;
/** An extra most of a size's listings bring is «the usual»; one few bring, a way to stand out. */
const NORMAL = 0.6;
const POCO = 0.25;

/** How a size is usually sold: «normalmente solo con los conos», «casi siempre con soporte y bolsa»… */
function comoSeVende(g: GrupoKit) {
  const normales = g.extras.filter((e) => e.parte >= NORMAL).map((e) => e.nombre.toLowerCase());
  if (g.sinExtras >= 0.5) return `normalmente sin extras (${pct(g.sinExtras)} de sus listings)`;
  if (normales.length) return `casi siempre con ${lista(normales)}`;
  return "con extras variados, sin uno que se repita";
}

/** A few sentences that sum up the view: what sells, how, at what price and who holds it. */
function conclusion(grupos: GrupoKit[], porPais: { pais: CodigoPais; g: GrupoKit }[], vista: "todos" | CodigoPais): string[] {
  const [g1, g2] = grupos;
  if (!g1) return [];
  const donde = vista === "todos" ? "" : ` en ${nombrePais(vista)}`;
  const frases = [
    `El kit que más factura${donde} es el de ${g1.nombre}: ${pct(g1.cuota)} del mercado analizado (${euros(g1.eur)} al mes, ${g1.filas.length} ${g1.filas.length === 1 ? "listing" : "listings"}), a ${precio(g1.precioMedio)} de media. Se vende ${comoSeVende(g1)}.`,
  ];
  if (g2) frases.push(`Le sigue el de ${g2.nombre}: ${pct(g2.cuota)} (${euros(g2.eur)} al mes), a ${precio(g2.precioMedio)} de media, ${comoSeVende(g2)}.`);
  if (g1.lider && g1.filas.length > 1)
    frases.push(
      g1.lider.cuota >= 0.4
        ? `En ${g1.nombre}, ${g1.lider.marca} se lleva el ${pct(g1.lider.cuota)}: hay un líder fuerte al que habrá que quitarle ventas.`
        : `En ${g1.nombre} las ventas están repartidas: la marca que más vende (${g1.lider.marca}) se lleva el ${pct(g1.lider.cuota)}.`,
    );
  const pocos = g1.extras.filter((e) => e.parte > 0 && e.parte <= POCO).map((e) => e.nombre.toLowerCase());
  if (pocos.length) frases.push(`Pocos kits de ${g1.nombre} traen ${lista(pocos)}: puede ser tu forma de diferenciarte.`);
  if (vista === "todos" && porPais.length > 1) {
    const distintos = new Map<string, CodigoPais[]>();
    for (const { pais, g } of porPais) if (g.clave !== g1.clave) distintos.set(g.nombre, [...(distintos.get(g.nombre) ?? []), pais]);
    frases.push(
      distintos.size
        ? `Ojo por países: ${[...distintos].map(([nombre, ps]) => `en ${lista(ps.map(nombrePais))} manda el de ${nombre}`).join("; ")}.`
        : `Es el tamaño que más vende en todos los países.`,
    );
  }
  return frases;
}

/**
 * «Lanzamiento → Qué kit lanzar»: the competitors' kits («Kits competidores», the ones already analysed) split by
 * size, with how much each size sells, at what price, with which extras and who holds it, per country, and a summary.
 */
export function QueKitLanzar({ estudio, onIrAKits }: { estudio: EstudioH10; onIrAKits: () => void }) {
  const cuantos = useCuantosListings(estudio.id);
  const r = repartoKits(estudio, cuantos);
  const paises = estudio.mercados.map((m) => m.codigoPais).filter((p) => r.filas.some((f) => f.pais === p));
  const [compartido, setCompartido] = usePaisEstudio();
  const eleccion = compartido ?? "todos";
  const setVista = (v: "todos" | CodigoPais) => setCompartido(v === "todos" ? null : v);
  const vista = eleccion !== "todos" && paises.includes(eleccion) ? eleccion : "todos";

  if (!r.principal || !r.filas.length)
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/[0.12] px-4 py-12 text-center text-sm text-ink-400">
        <p className="max-w-md">Para ver qué kit conviene lanzar, analiza primero los kits de la competencia en Competencia → Kits.</p>
        <button onClick={onIrAKits} className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-950 hover:bg-accent-400">
          Ir a Competencia → Kits
        </button>
      </div>
    );

  const grupos = r.grupos(vista === "todos" ? r.filas : r.filas.filter((f) => f.pais === vista));
  const total = grupos.reduce((s, g) => s + g.eur, 0);
  const porPais = paises.map((p) => ({ pais: p, gs: r.grupos(r.filas.filter((f) => f.pais === p)) })).filter((x) => x.gs.length);
  const frases = conclusion(
    grupos,
    porPais.map((x) => ({ pais: x.pais, g: x.gs[0] })),
    vista,
  );
  const visibles = grupos.slice(0, MAX_GRUPOS);
  const resto = grupos.slice(MAX_GRUPOS);
  const maxCuota = Math.max(...grupos.map((g) => g.cuota), 0.01);

  const boton = (id: "todos" | CodigoPais) => (
    <button
      key={id}
      onClick={() => setVista(id)}
      aria-pressed={vista === id}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${vista === id ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
    >
      {id === "todos" ? "Todos los países" : <Pais codigo={id} corto />}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-ink-100">Qué kit lanzar</h2>
        <p className="mt-0.5 text-xs text-ink-400">
          Los kits de la competencia agrupados por cuántos {plural(r.principal)} traen: cuánto vende cada tamaño, a qué precio, con qué extras y quién lo domina. Sale de los{" "}
          {r.analizados} listings analizados en Competencia → Kits (los {cuantos} primeros de cada país).
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">{(["todos", ...paises] as const).map(boton)}</div>

      <section className="rounded-xl border border-accent-500/30 bg-accent-500/[0.05] p-4">
        <p className="text-[11px] font-semibold tracking-wide text-accent-300 uppercase">Conclusión</p>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-ink-100">
          {frases.map((f) => (
            <li key={f} className="flex gap-2">
              <span className="text-accent-400">•</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </section>

      <Tarjeta titulo="Reparto del mercado por tamaño de kit" subtitulo="Facturación y unidades al mes de cada tamaño, su precio y la marca que más vende">
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="tabular w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-xs text-ink-400">
                <th className="px-2 py-2 text-left font-medium">Kit</th>
                <th className="px-2 py-2 text-left font-medium">Parte del mercado</th>
                <th className="px-2 py-2 text-right font-medium">Facturación/mes</th>
                <th className="px-2 py-2 text-right font-medium">Uds/mes</th>
                <th className="px-2 py-2 text-right font-medium" title="Facturación entre unidades: lo que paga de media el comprador">
                  Precio medio
                </th>
                <th className="px-2 py-2 text-right font-medium" title="El más barato · el típico (mediana) · el más caro de sus listings">
                  Precios (mín · típico · máx)
                </th>
                <th className="px-2 py-2 text-right font-medium">Listings</th>
                <th className="px-2 py-2 text-left font-medium">Marca líder</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((g) => (
                <tr key={g.clave} className="border-b border-white/[0.04]">
                  <td className="px-2 py-2 font-semibold whitespace-nowrap text-ink-100">{g.nombre}</td>
                  <td className="px-2 py-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-28 overflow-hidden rounded-full bg-white/[0.05]">
                        <span className="block h-full rounded-full bg-serie-ventas" style={{ width: `${(g.cuota / maxCuota) * 100}%` }} />
                      </span>
                      <span className="text-ink-200">{pct(g.cuota)}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right text-ink-100">{euros(g.eur)}</td>
                  <td className="px-2 py-2 text-right text-ink-300">{formatNumero(Math.round(g.uds))}</td>
                  <td className="px-2 py-2 text-right text-ink-100">{precio(g.precioMedio)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap text-ink-300">
                    {g.precios ? `${precio(g.precios.min)} · ${precio(g.precios.tipico)} · ${precio(g.precios.max)}` : "—"}
                  </td>
                  <td className="px-2 py-2 text-right text-ink-300">{g.filas.length}</td>
                  <td className="px-2 py-2 text-ink-300">{g.lider ? `${g.lider.marca} · ${pct(g.lider.cuota)}` : "—"}</td>
                </tr>
              ))}
              {resto.length > 0 && (
                <tr className="border-b border-white/[0.04] text-ink-400">
                  <td className="px-2 py-2" title={resto.map((g) => g.nombre).join(", ")}>
                    Otros tamaños ({resto.map((g) => g.clave).join(", ")})
                  </td>
                  <td className="px-2 py-2">{pct(resto.reduce((s, g) => s + g.cuota, 0))}</td>
                  <td className="px-2 py-2 text-right">{euros(resto.reduce((s, g) => s + g.eur, 0))}</td>
                  <td className="px-2 py-2 text-right">{formatNumero(Math.round(resto.reduce((s, g) => s + g.uds, 0)))}</td>
                  <td colSpan={2} />
                  <td className="px-2 py-2 text-right">{resto.reduce((s, g) => s + g.filas.length, 0)}</td>
                  <td />
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="text-ink-100">
                <td className="px-2 py-2 font-semibold">Total</td>
                <td />
                <td className="px-2 py-2 text-right font-semibold">{euros(total)}</td>
                <td className="px-2 py-2 text-right">{formatNumero(Math.round(grupos.reduce((s, g) => s + g.uds, 0)))}</td>
                <td colSpan={2} />
                <td className="px-2 py-2 text-right">{grupos.reduce((s, g) => s + g.filas.length, 0)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Tarjeta>

      {vista === "todos" && porPais.length > 1 && (
        <Tarjeta titulo="Qué tamaño manda en cada país" subtitulo="Los dos tamaños que más facturan en cada mercado">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {porPais.map(({ pais, gs }) => (
              <li key={pais} className="rounded-lg border border-white/[0.06] bg-ink-950/40 px-3.5 py-3">
                <Pais codigo={pais} />
                <p className="mt-1.5 text-sm text-ink-100">
                  <strong>{gs[0].nombre}</strong> <span className="text-ink-400">· {pct(gs[0].cuota)} · {euros(gs[0].eur)}/mes</span>
                </p>
                {gs[1] && (
                  <p className="text-xs text-ink-400">
                    después {gs[1].nombre} · {pct(gs[1].cuota)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      <Tarjeta
        titulo="Qué extras trae cada tamaño"
        subtitulo={`Parte de los listings de cada tamaño que trae cada extra: «lo normal» si lo traen ${pct(NORMAL)} o más (casi obligatorio para competir), «diferenciador» si lo traen ${pct(POCO)} o menos`}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {visibles.slice(0, 4).map((g) => (
            <div key={g.clave} className="rounded-lg border border-white/[0.06] bg-ink-950/40 p-3">
              <Seccion titulo={g.nombre} texto={`${g.filas.length} ${g.filas.length === 1 ? "listing" : "listings"} · ${pct(g.cuota)} del mercado`} />
              <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                {[...g.extras.map((e) => ({ nombre: e.nombre, parte: e.parte, sin: false })), { nombre: "Sin extras (solo el producto)", parte: g.sinExtras, sin: true }]
                  .filter((e) => e.parte > 0)
                  .map((e) => (
                    <li key={e.nombre} className="grid grid-cols-[1fr_96px_auto] items-center gap-2">
                      <span className={e.sin ? "text-ink-400" : "text-ink-100"}>{e.nombre}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                        <span className="block h-full rounded-full bg-serie-ventas" style={{ width: `${e.parte * 100}%` }} />
                      </span>
                      <span className="tabular flex w-36 items-center justify-end gap-1.5 text-xs text-ink-300">
                        {pct(e.parte)}
                        {!e.sin && e.parte >= NORMAL && <span className="rounded bg-success/15 px-1.5 py-px text-[10px] font-medium text-success">lo normal</span>}
                        {!e.sin && e.parte <= POCO && <span className="rounded bg-accent-500/15 px-1.5 py-px text-[10px] font-medium text-accent-300">diferenciador</span>}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </Tarjeta>

      <p className="text-[11px] leading-relaxed text-ink-500">
        Cifras del mes de cada Xray (libras pasadas a euros): sirven para comparar tamaños entre sí, no como facturación del año. No se cuentan
        {r.pendientes ? ` ${r.pendientes} listings pendientes de analizar,` : ""} {r.otros} de otro producto ni {r.sinCantidad} que no dicen cuántos {plural(r.principal)} traen.
      </p>
    </div>
  );
}
