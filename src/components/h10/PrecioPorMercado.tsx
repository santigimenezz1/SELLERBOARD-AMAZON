"use client";

import { useEffect, useRef, useState } from "react";
import type { CodigoPais, EstudioH10, KitCompetidor, PrecioMercado } from "@/lib/datos/h10Tipos";
import { cantidadPrincipal, elementoPrincipal, grupoExtra, plural } from "@/lib/datos/h10Kits";
import { lideresListings } from "@/lib/datos/h10Listings";
import { enlaceAmazon } from "@/lib/datos/h10Enlaces";
import { calcularTarifa, type PaisTarifa } from "@/lib/datos/tarifasFba";
import { aPrecio, type SupuestosRentabilidad } from "@/lib/datos/rentabilidadFba";
import { formatNumero } from "@/lib/format";
import { Pais, Tarjeta, usePaisEstudio } from "./comun";
import { useCuantosListings } from "./PestanaKits";

/*
 * «Precio por mercado»: in each country, who sells the same kit as yours (from «Kits»), at what prices, and the price
 * to launch at, aim for and not go over, with what each one leaves you (your box and costs from «Tarifas FBA»).
 */

const PAISES: CodigoPais[] = ["ES", "DE", "FR", "GB"];
const aTarifa = (p: CodigoPais): PaisTarifa => (p === "GB" ? "UK" : (p as PaisTarifa));
const simbolo = (p: CodigoPais) => (p === "GB" ? "£" : "€");
const dinero = (v: number, p: CodigoPais) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${simbolo(p)}`;
const pct = (v: number) => `${Math.round(v * 100)} %`;
/** A price as shops write it: 38,99. */
const comercial = (v: number) => Math.max(0.99, Math.round(v) - 0.01);
const precioDe = (k: KitCompetidor) => k.precio ?? k.precioXray;
const INICIAL: PrecioMercado = { cantidad: 2, extras: ["Conos reforzados", "Calcetines", "Caja personalizada", "App con ejercicios"], rivales: {}, precios: {} };

/** The value below which `parte` of the units sell (each price weighted by its units). */
function percentil(filas: { precio: number; uds: number }[], parte: number) {
  const orden = [...filas].sort((a, b) => a.precio - b.precio);
  const total = orden.reduce((s, f) => s + f.uds, 0);
  let acumulado = 0;
  for (const f of orden) {
    acumulado += f.uds;
    if (acumulado >= total * parte) return f.precio;
  }
  return orden.at(-1)?.precio ?? 0;
}

/** Your costs as «Tarifas FBA → Rentabilidad por país» keeps them in this browser, and whether you're in the CEP. */
function useCostes(estudioId: string) {
  const [c, setC] = useState<{ s: SupuestosRentabilidad; cep: boolean } | null>(null);
  useEffect(() => {
    const n = (v: unknown) => {
      const x = Number(String(v ?? "").replace(",", "."));
      return Number.isFinite(x) && x > 0 ? x : 0;
    };
    let s: SupuestosRentabilidad = { coste: 0, envio: 0, comision: 15, meses: 1, temporada: new Date().getMonth() >= 9 ? "alta" : "baja" };
    let cep = false;
    try {
      const g = JSON.parse(localStorage.getItem(`tarifas-fba-rentabilidad-${estudioId}`) ?? "null");
      if (g) s = { coste: n(g.coste), envio: n(g.envio), comision: n(g.comision) || 15, meses: n(g.meses), temporada: g.temporada === "alta" ? "alta" : "baja" };
      cep = !!JSON.parse(localStorage.getItem(`tarifas-fba-caja-${estudioId}`) ?? "null")?.cep;
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser after mounting
    setC({ s, cep });
  }, [estudioId]);
  return c;
}

/** One country's rivals: every analysed kit among its best sellers, in (same size of kit, or chosen) or out. */
function rivalesDe(estudio: EstudioH10, pais: CodigoPais, cuantos: number, pm: PrecioMercado, principal: string | null) {
  const asins = new Set(lideresListings(estudio.mercados, pais, estudio.listingsQuitados ?? [], cuantos).map((x) => x.c.asin));
  return (estudio.kitsCompetidores?.porPais[pais] ?? [])
    .filter((k) => asins.has(k.asin))
    .map((k) => {
      const cantidad = cantidadPrincipal(k, principal);
      const igual = !k.otroProducto && cantidad === pm.cantidad;
      const clave = `${pais}|${k.asin}`;
      return { k, cantidad, igual, dentro: pm.rivales[clave] ?? igual, clave };
    })
    .sort((a, b) => Number(b.dentro) - Number(a.dentro) || b.k.facturacion - a.k.facturacion);
}

/** The prices of a country's chosen rivals and the three to propose: launch, aim, top. */
function preciosDe(rivales: ReturnType<typeof rivalesDe>) {
  const filas = rivales.filter((r) => r.dentro && precioDe(r.k)).map((r) => ({ precio: precioDe(r.k)!, uds: Math.max(1, r.k.ventasMes ?? 0), r }));
  if (!filas.length) return null;
  const tipico = percentil(filas, 0.5);
  const lider = [...filas].sort((a, b) => b.r.k.facturacion - a.r.k.facturacion)[0];
  return {
    filas,
    min: Math.min(...filas.map((f) => f.precio)),
    max: Math.max(...filas.map((f) => f.precio)),
    tipico,
    alto: percentil(filas, 0.75),
    lider,
    propuestos: [
      { id: "lanzamiento", nombre: "Lanzamiento", precio: comercial(tipico * 0.9), porque: "Un 10 % por debajo del típico de tus rivales, para entrar y ganar las primeras ventas y reseñas" },
      { id: "objetivo", nombre: "Objetivo", precio: comercial(tipico), porque: "El precio típico de tus rivales (la mitad de sus ventas va por debajo y la otra mitad por encima)" },
      { id: "maximo", nombre: "Máximo", precio: comercial(Math.max(percentil(filas, 0.75), tipico * 1.1)), porque: "Al nivel de los más caros que venden: solo con reseñas y lo que tú das de más" },
    ],
  };
}

/** «Precio por mercado». `eurPorGbp`: to take your euro costs to the UK. */
export function PrecioPorMercado({ estudio, eurPorGbp = 1.16, onIrA }: { estudio: EstudioH10; eurPorGbp?: number; onIrA: (pestana: "competencia" | "numeros", sub: string) => void }) {
  const cuantos = useCuantosListings(estudio.id);
  const principal = elementoPrincipal(estudio.kitsCompetidores);
  const [pm, setPm] = useState<PrecioMercado>(estudio.precioMercado ?? INICIAL);
  const [extrasTexto, setExtrasTexto] = useState(pm.extras.join(", "));
  const [compartido, setPais] = usePaisEstudio(PAISES);
  const pais = compartido ?? "ES";
  const costes = useCostes(estudio.id);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [guardado, setGuardado] = useState<"" | "guardando" | "ok" | "error">("");

  const cambiar = (nuevo: PrecioMercado) => {
    setPm(nuevo);
    if (estudio.ejemplo) return;
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(async () => {
      setGuardado("guardando");
      const r = await fetch(`/api/h10/estudios/${estudio.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ precioMercado: nuevo }) }).catch(() => null);
      setGuardado(r?.ok ? "ok" : "error");
    }, 800);
  };

  const caja = estudio.supuestos?.miCaja;
  const tarifa = caja && caja.largo && caja.ancho && caja.alto && caja.peso ? calcularTarifa({ largo: caja.largo, ancho: caja.ancho, alto: caja.alto, pesoG: Math.round(caja.peso * 1000) }, costes?.cep ?? false) : null;
  const sinCostes = !costes?.s.coste;
  const ganancia = (p: CodigoPais, precio: number) => (tarifa?.categoria && costes ? aPrecio(tarifa, costes.s, eurPorGbp, aTarifa(p), precio) : null);

  if (!principal)
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/[0.12] px-4 py-12 text-center text-sm text-ink-400">
        <p className="max-w-md">Para saber contra quién compites, analiza primero qué incluye cada kit de la competencia.</p>
        <button onClick={() => onIrA("competencia", "kits")} className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-950 hover:bg-accent-400">
          Ir a Competencia → Kits
        </button>
      </div>
    );

  const rivales = rivalesDe(estudio, pais, cuantos, pm, principal);
  const precios = preciosDe(rivales);
  const propio = pm.precios[pais];
  const nombreKit = `${pm.cantidad} ${pm.cantidad === 1 ? principal.toLowerCase() : plural(principal)}`;
  const misGrupos = new Set(pm.extras.map(grupoExtra));
  const resumen = PAISES.map((p) => {
    const pr = preciosDe(rivalesDe(estudio, p, cuantos, pm, principal));
    return { p, pr, rivales: pr?.filas.length ?? 0 };
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-ink-100">Precio por mercado</h2>
        <p className="mt-0.5 text-xs text-ink-400">
          En cada país: quién vende lo mismo que tú, a qué precios, y a cuánto te conviene salir. Los rivales salen de los {cuantos} que más venden de cada país con su kit analizado en Competencia → Kits; tu
          ganancia, de tu caja y tus costes de Tarifas FBA.
        </p>
      </div>

      <Tarjeta titulo="1. Tu kit" subtitulo={`Lo que vas a vender. Se guarda en el estudio${guardado === "guardando" ? " · guardando…" : guardado === "ok" ? " · guardado ✓" : guardado === "error" ? " · no se pudo guardar" : ""}.`}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-ink-400">
            {principal}s
            <input
              inputMode="numeric"
              value={pm.cantidad}
              onChange={(e) => cambiar({ ...pm, cantidad: Math.max(1, Math.min(999, Math.round(Number(e.target.value.replace(/\D/g, "")) || 1))) })}
              className="tabular h-9 w-20 rounded-lg border border-white/[0.08] bg-ink-950/60 px-3 text-sm text-ink-100 outline-none focus:border-accent-500/60"
            />
          </label>
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs text-ink-400">
            Extras (separados por comas)
            <input
              value={extrasTexto}
              onChange={(e) => {
                setExtrasTexto(e.target.value);
                cambiar({ ...pm, extras: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) });
              }}
              className="h-9 rounded-lg border border-white/[0.08] bg-ink-950/60 px-3 text-sm text-ink-100 outline-none focus:border-accent-500/60"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-ink-400">
          Compites contra los que venden <b className="text-ink-200">{nombreKit}</b>. Puedes añadir o quitar rivales a mano en la lista de cada país.
        </p>
      </Tarjeta>

      <div className="flex flex-wrap gap-1.5">
        {PAISES.map((p) => (
          <button
            key={p}
            onClick={() => setPais(p)}
            aria-pressed={pais === p}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${pais === p ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
          >
            <Pais codigo={p} />
          </button>
        ))}
      </div>

      <Tarjeta
        titulo={`2. Contra quién compites · ${rivales.filter((r) => r.dentro).length} rivales`}
        subtitulo="Marcados: los que venden el mismo número de porterías que tú (y los que añadas). Toca la casilla para quitar o añadir uno. Los extras que también das tú, en verde."
      >
        {!rivales.length ? (
          <p className="text-sm text-ink-400">
            No hay kits analizados en este país.{" "}
            <button onClick={() => onIrA("competencia", "kits")} className="text-accent-300 hover:text-accent-400">
              Analízalos en Competencia → Kits
            </button>
            .
          </p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="tabular w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs text-ink-400">
                  <th className="w-8 px-2 py-2" />
                  <th className="px-2 py-2 text-left font-medium">Rival</th>
                  <th className="px-2 py-2 text-left font-medium">Qué incluye</th>
                  <th className="px-2 py-2 text-right font-medium">Precio</th>
                  <th className="px-2 py-2 text-right font-medium">Ventas/mes</th>
                  <th className="px-2 py-2 text-right font-medium">Facturación/mes</th>
                  <th className="px-2 py-2 text-right font-medium">Valoración</th>
                </tr>
              </thead>
              <tbody>
                {rivales.map(({ k, dentro, clave }) => (
                  <tr key={clave} className={`border-b border-white/[0.04] ${dentro ? "" : "opacity-45"}`}>
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={dentro}
                        onChange={(e) => cambiar({ ...pm, rivales: { ...pm.rivales, [clave]: e.target.checked } })}
                        aria-label={`Competidor: ${k.marca}`}
                        className="accent-accent-500"
                      />
                    </td>
                    <td className="max-w-[260px] px-2 py-2">
                      <a href={enlaceAmazon(pais, k.asin, k.titulo)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-accent-300">
                        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded bg-white p-0.5">
                          {/* eslint-disable-next-line @next/next/no-img-element -- Amazon's own photo */}
                          {k.imagen && <img src={k.imagen} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium text-ink-100">{k.marca}</span>
                          <span className="block truncate text-xs text-ink-500">{k.titulo}</span>
                        </span>
                      </a>
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {k.otroProducto ? (
                        <span className="text-ink-500">Otro producto: {k.otroProducto}</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {k.elementos.map((e, i) => {
                            const comun = e.nombre.toLowerCase() !== principal.toLowerCase() && misGrupos.has(grupoExtra(e.nombre));
                            return (
                              <span key={i} className={`rounded px-1.5 py-0.5 ${comun ? "bg-success/15 text-success" : "bg-white/[0.05] text-ink-300"}`} title={e.detalle ?? undefined}>
                                {e.cantidad ? `${e.cantidad} ` : ""}
                                {e.nombre}
                              </span>
                            );
                          })}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-ink-100">{precioDe(k) ? dinero(precioDe(k)!, pais) : "—"}</td>
                    <td className="px-2 py-2 text-right text-ink-300">{k.ventasMes !== null ? formatNumero(k.ventasMes) : "—"}</td>
                    <td className="px-2 py-2 text-right text-ink-300">{dinero(k.facturacion, pais)}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap text-ink-300">
                      {k.valoracion !== null ? `${k.valoracion.toLocaleString("es-ES")} ★` : "—"} <span className="text-xs text-ink-500">({formatNumero(k.resenas)})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {precios && (
        <Tarjeta titulo="3. Qué precios manejan tus rivales" subtitulo="Ponderado por lo que vende cada uno: el que más vende pesa más.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Más barato", dinero(precios.min, pais)],
              ["Precio típico", dinero(precios.tipico, pais)],
              ["Más caro", dinero(precios.max, pais)],
              [`Líder (${precios.lider.r.k.marca})`, `${dinero(precios.lider.precio, pais)} · ${formatNumero(precios.lider.r.k.ventasMes ?? 0)} uds/mes`],
            ].map(([t, v]) => (
              <div key={t} className="rounded-lg border border-white/[0.06] bg-ink-950/40 px-3 py-2.5">
                <p className="text-xs text-ink-400">{t}</p>
                <p className="tabular mt-0.5 text-lg font-semibold text-ink-100">{v}</p>
              </div>
            ))}
          </div>
          <BarrasPrecio filas={precios.filas} pais={pais} />
        </Tarjeta>
      )}

      {precios && (
        <Tarjeta titulo={`4. Tu precio en ${pais === "GB" ? "Reino Unido" : pais === "ES" ? "España" : pais === "DE" ? "Alemania" : "Francia"}`} subtitulo="Tres precios propuestos y el tuyo, con lo que te deja cada uno.">
          {!tarifa?.categoria && (
            <p className="mb-3 text-xs text-warning">
              Para ver tu ganancia, pon tu caja en{" "}
              <button onClick={() => onIrA("numeros", "tarifas")} className="underline">
                Números → Tarifas FBA
              </button>
              .
            </p>
          )}
          {tarifa?.categoria && sinCostes && (
            <p className="mb-3 text-xs text-warning">
              Pon el coste del producto y el envío en{" "}
              <button onClick={() => onIrA("numeros", "tarifas")} className="underline">
                Números → Tarifas FBA → Rentabilidad por país
              </button>
              : sin ellos, la ganancia sale de más.
            </p>
          )}
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="tabular w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs text-ink-400">
                  <th className="px-2 py-2 text-left font-medium">Precio</th>
                  <th className="px-2 py-2 text-right font-medium">Venta</th>
                  <th className="px-2 py-2 text-right font-medium">Más baratos que tú</th>
                  <th className="px-2 py-2 text-right font-medium">Ganas por unidad</th>
                  <th className="px-2 py-2 text-right font-medium">Margen</th>
                  <th className="px-2 py-2 text-right font-medium">ROAS mínimo</th>
                </tr>
              </thead>
              <tbody>
                {[...precios.propuestos, ...(propio ? [{ id: "propio", nombre: "El tuyo", precio: propio, porque: "El precio que has escrito" }] : [])].map((x) => {
                  const g = ganancia(pais, x.precio);
                  const baratos = precios.filas.filter((f) => f.precio < x.precio).length;
                  return (
                    <tr key={x.id} className="border-b border-white/[0.04]">
                      <td className="px-2 py-2">
                        <span className="font-semibold text-ink-100">{x.nombre}</span>
                        <span className="block text-xs text-ink-500">{x.porque}</span>
                      </td>
                      <td className="px-2 py-2 text-right text-base font-semibold text-ink-100">{dinero(x.precio, pais)}</td>
                      <td className="px-2 py-2 text-right text-ink-300">
                        {baratos} de {precios.filas.length}
                      </td>
                      <td className={`px-2 py-2 text-right font-semibold ${g ? (g.ganancia >= 0 ? "bg-success/10 text-success" : "bg-danger/10 text-danger") : "text-ink-500"}`}>{g ? dinero(g.ganancia, pais) : "—"}</td>
                      <td className={`px-2 py-2 text-right ${g ? (g.margen >= 0 ? "text-success" : "text-danger") : "text-ink-500"}`}>{g ? pct(g.margen) : "—"}</td>
                      <td className="px-2 py-2 text-right text-ink-300">{g?.roas ? g.roas.toLocaleString("es-ES", { maximumFractionDigits: 1 }) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-ink-400">
            Prueba tu precio:
            <input
              inputMode="decimal"
              defaultValue={propio ? String(propio).replace(".", ",") : ""}
              key={pais}
              placeholder="0,00"
              onChange={(e) => {
                const v = Number(e.target.value.replace(",", "."));
                const precios2 = { ...pm.precios };
                if (Number.isFinite(v) && v > 0) precios2[pais] = v;
                else delete precios2[pais];
                cambiar({ ...pm, precios: precios2 });
              }}
              className="tabular h-8 w-24 rounded-lg border border-white/[0.08] bg-ink-950/60 px-2 text-right text-sm text-ink-100 outline-none focus:border-accent-500/60"
            />
            {simbolo(pais)} (con IVA)
          </label>
        </Tarjeta>
      )}

      <Tarjeta titulo="5. Los 4 países de un vistazo" subtitulo="Con los rivales marcados en cada país. Toca uno para verlo.">
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="tabular w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-xs text-ink-400">
                <th className="px-2 py-2 text-left font-medium">País</th>
                <th className="px-2 py-2 text-right font-medium">Rivales</th>
                <th className="px-2 py-2 text-right font-medium">Precio típico</th>
                <th className="px-2 py-2 text-right font-medium">Lanzamiento</th>
                <th className="px-2 py-2 text-right font-medium">Objetivo</th>
                <th className="px-2 py-2 text-right font-medium">Ganas a precio objetivo</th>
              </tr>
            </thead>
            <tbody>
              {resumen.map(({ p, pr, rivales: n }) => {
                const g = pr ? ganancia(p, pr.propuestos[1].precio) : null;
                return (
                  <tr key={p} onClick={() => setPais(p)} className={`cursor-pointer border-b border-white/[0.04] hover:bg-white/[0.03] ${p === pais ? "bg-accent-500/[0.06]" : ""}`}>
                    <td className="px-2 py-2">
                      <Pais codigo={p} />
                    </td>
                    <td className="px-2 py-2 text-right text-ink-300">{n}</td>
                    <td className="px-2 py-2 text-right text-ink-200">{pr ? dinero(pr.tipico, p) : "—"}</td>
                    <td className="px-2 py-2 text-right text-ink-200">{pr ? dinero(pr.propuestos[0].precio, p) : "—"}</td>
                    <td className="px-2 py-2 text-right font-semibold text-ink-100">{pr ? dinero(pr.propuestos[1].precio, p) : "—"}</td>
                    <td className={`px-2 py-2 text-right font-semibold ${g ? (g.ganancia >= 0 ? "text-success" : "text-danger") : "text-ink-500"}`}>{g ? `${dinero(g.ganancia, p)} (${pct(g.margen)})` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-500">
          Lanzamiento: 10 % por debajo del típico. Objetivo: el típico. Máximo: el nivel de los más caros que venden. Precios de hoy en Amazon (o del Xray si no hay oferta), con IVA; Reino Unido en libras.
        </p>
      </Tarjeta>
    </div>
  );
}

/** Where the rivals' units sell, by price band (5 € or £ wide). */
function BarrasPrecio({ filas, pais }: { filas: { precio: number; uds: number }[]; pais: CodigoPais }) {
  const tramos = new Map<number, number>();
  for (const f of filas) tramos.set(Math.floor(f.precio / 5) * 5, (tramos.get(Math.floor(f.precio / 5) * 5) ?? 0) + f.uds);
  const lista = [...tramos].sort((a, b) => a[0] - b[0]);
  const max = Math.max(...lista.map((x) => x[1]), 1);
  return (
    <div className="mt-4 flex flex-col gap-1.5">
      <p className="text-xs font-medium text-ink-300">Dónde se venden sus unidades</p>
      {lista.map(([desde, uds]) => (
        <div key={desde} className="grid grid-cols-[110px_1fr_90px] items-center gap-2 text-xs">
          <span className="text-ink-400">
            {desde}–{desde + 5} {simbolo(pais)}
          </span>
          <span className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
            <span className="block h-full rounded-full bg-serie-ventas" style={{ width: `${(uds / max) * 100}%` }} />
          </span>
          <span className="tabular text-right text-ink-300">{formatNumero(uds)} uds/mes</span>
        </div>
      ))}
    </div>
  );
}
