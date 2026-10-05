"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CodigoPais, EstudioH10, FichaAmazon, PuntoSeguimiento } from "@/lib/datos/h10Tipos";
import { nombrePais } from "@/lib/datos/h10Analisis";
import { formatMoneda, formatNumero } from "@/lib/format";
import { Spinner } from "@/components/Spinner";
import { Pais, Tarjeta } from "./comun";

const dinero = (v: number | null, moneda: string) => (v === null ? "—" : formatMoneda(v, moneda));
const fecha = (dia: string) => dia.split("-").reverse().slice(0, 2).join("/");

/** Tiny line of a daily series (no axes: the first and last values are written next to it). */
function MiniLinea({ valores, invertir = false }: { valores: number[]; invertir?: boolean }) {
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min || 1;
  const puntos = valores.map((v, i) => {
    const x = valores.length === 1 ? 30 : (i / (valores.length - 1)) * 60;
    // Sales rank: lower is better, so it's drawn upside down (going up = selling more).
    const y = invertir ? ((v - min) / rango) * 16 + 2 : 18 - ((v - min) / rango) * 16;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox="0 0 60 20" className="h-5 w-[60px] shrink-0 overflow-visible text-serie-ventas" aria-hidden>
      <polyline points={puntos.join(" ")} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Evolucion({ puntos, moneda }: { puntos: PuntoSeguimiento[]; moneda: string }) {
  const precios = puntos.filter((p) => p.precio !== null);
  const ranks = puntos.filter((p) => p.rank !== null);
  if (puntos.length < 2) return <span className="text-[11px] text-ink-500">{puntos[0] ? `desde el ${fecha(puntos[0].dia)}` : "—"}</span>;
  return (
    <span className="flex flex-col gap-1 text-[11px] text-ink-400">
      {precios.length >= 2 && (
        <span className="flex items-center gap-1.5" title={`Precio del ${fecha(precios[0].dia)} al ${fecha(precios.at(-1)!.dia)}`}>
          <MiniLinea valores={precios.map((p) => p.precio!)} />
          {dinero(precios[0].precio, moneda)} → {dinero(precios.at(-1)!.precio, moneda)}
        </span>
      )}
      {ranks.length >= 2 && (
        <span className="flex items-center gap-1.5" title="Ranking: hacia arriba = vende más">
          <MiniLinea valores={ranks.map((p) => p.rank!)} invertir />#{formatNumero(ranks[0].rank!)} → #{formatNumero(ranks.at(-1)!.rank!)}
        </span>
      )}
    </span>
  );
}

/**
 * «Datos de Amazon»: the competitors read straight from Amazon (fees, package, rank, price, sellers) per country,
 * with the button that fetches them and the daily follow-up the sync keeps adding to.
 */
export function DatosAmazon({ estudio, pares }: { estudio: EstudioH10; pares: { asin: string; codigoPais: CodigoPais }[] }) {
  const router = useRouter();
  const datos = estudio.amazon ?? [];
  const paises = [...new Set([...pares.map((p) => p.codigoPais), ...datos.map((d) => d.ficha.codigoPais)])];
  const [pais, setPais] = useState<string | null>(null);
  const [cola, setCola] = useState<{ hecho: number; total: number } | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [nuevo, setNuevo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!cola) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [cola]);

  const traer = async () => {
    if (cola || !pares.length) return;
    setErrores([]);
    setAviso(null);
    setCola({ hecho: 0, total: pares.length });
    const fallos: string[] = [];
    // One at a time: Amazon allows few offer queries per second.
    for (const [i, p] of pares.entries()) {
      try {
        const r = await fetch(`/api/h10/estudios/${estudio.id}/amazon`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asin: p.asin, pais: p.codigoPais }) });
        const b = (await r.json().catch(() => ({}))) as { error?: string; ficha?: FichaAmazon };
        if (!r.ok) throw new Error(b.error ?? `error ${r.status}`);
        if (b.ficha?.error && !b.ficha.error.startsWith("No se vende")) fallos.push(`${p.asin} en ${nombrePais(p.codigoPais)}: ${b.ficha.error}`);
      } catch (e) {
        fallos.push(`${p.asin} en ${nombrePais(p.codigoPais)}: ${e instanceof Error ? e.message : "Amazon no respondió"}`);
      }
      setCola({ hecho: i + 1, total: pares.length });
      if ((i + 1) % 5 === 0) router.refresh();
    }
    setErrores(fallos);
    setCola(null);
    router.refresh();
  };

  const manual = async (asin: string, accion: "agregar" | "quitar") => {
    setAviso(null);
    const r = await fetch(`/api/h10/estudios/${estudio.id}/amazon`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asin, accion }) }).catch(() => null);
    const b = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!r?.ok) return setAviso(b?.error ?? "No se pudo guardar");
    if (accion === "agregar") {
      setNuevo("");
      setAviso(`${asin.toUpperCase()} añadido: pulsa «Traer datos de Amazon» para leerlo en los 5 países.`);
    }
    router.refresh();
  };

  const visibles = datos.filter((d) => !pais || d.ficha.codigoPais === pais).sort((a, b) => a.ficha.codigoPais.localeCompare(b.ficha.codigoPais) || (a.ficha.error ? 1 : 0) - (b.ficha.error ? 1 : 0));
  const ultima = datos.map((d) => d.ficha.actualizadoEn).sort().at(-1);

  return (
    <Tarjeta
      titulo="Datos de Amazon"
      subtitulo="Tarifas, medidas, ranking, precio y vendedores de cada competidor, leídos directamente de Amazon en cada país. La app los vuelve a mirar sola cada día y guarda la evolución."
    >
      {estudio.ejemplo ? (
        <p className="mb-3 text-xs text-ink-500">Estudio de ejemplo: son los datos reales que Amazon dio del rebounder de Racetex en la prueba (5 de octubre). En tus estudios, el botón los trae solo.</p>
      ) : (
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void traer()}
              disabled={!!cola || !pares.length}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent-500 px-3.5 text-sm font-medium text-ink-950 transition-all hover:bg-accent-400 active:scale-[0.97] disabled:opacity-50"
            >
              {cola ? <Spinner tamano="sm" /> : <span aria-hidden>⇣</span>}
              {cola ? `Leyendo de Amazon: ${cola.hecho} de ${cola.total}…` : `Traer datos de Amazon (${pares.length})`}
            </button>
            {ultima && !cola && <span className="text-xs text-ink-500">Última lectura: {new Date(ultima).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
          </div>
          {!pares.length && (
            <p className="text-xs text-ink-400">Los ASIN salen del Xray en CSV (las capturas no los traen). Sube un CSV de Xray o añade aquí el ASIN de un competidor.</p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (nuevo.trim()) void manual(nuevo.trim(), "agregar");
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value.toUpperCase())}
              maxLength={10}
              placeholder="Añadir ASIN (B0…)"
              className="tabular h-8 w-40 rounded-lg border border-white/[0.08] bg-ink-950/60 px-2.5 text-sm text-ink-100 outline-none focus:border-accent-500/60"
            />
            <button type="submit" disabled={nuevo.trim().length !== 10} className="h-8 rounded-lg border border-white/[0.1] px-3 text-xs text-ink-200 hover:bg-white/[0.06] disabled:opacity-40">
              Añadir en los 5 países
            </button>
            {(estudio.asinsManuales ?? []).map((a) => (
              <span key={a} className="tabular inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-xs text-ink-200">
                {a}
                <button type="button" onClick={() => void manual(a, "quitar")} title="Quitar del seguimiento" className="text-ink-500 hover:text-danger">
                  ✕
                </button>
              </span>
            ))}
          </form>
          {aviso && <p className="text-xs text-accent-300">{aviso}</p>}
          {errores.length > 0 && (
            <ul role="alert" className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">
              {errores.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {datos.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-400">Aún no hay datos de Amazon en este estudio.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[null, ...paises].map((p) => (
              <button
                key={p ?? "todos"}
                onClick={() => setPais(p)}
                aria-pressed={pais === p}
                className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${pais === p ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
              >
                {p ? <Pais codigo={p} corto /> : "Todos"}
              </button>
            ))}
          </div>
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="tabular w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-left text-xs text-ink-400">
                  <th className="px-2 py-2 font-medium">País</th>
                  <th className="px-2 py-2 font-medium">Competidor</th>
                  <th className="px-2 py-2 font-medium">Caja (Amazon)</th>
                  <th className="px-2 py-2 font-medium">Ranking</th>
                  <th className="px-2 py-2 text-right font-medium">Precio</th>
                  <th className="px-2 py-2 text-right font-medium">Vendedores</th>
                  <th className="px-2 py-2 text-right font-medium">Comisión</th>
                  <th className="px-2 py-2 text-right font-medium">Tarifa FBA</th>
                  <th className="px-2 py-2 font-medium">Evolución</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(({ ficha: f, puntos }) => (
                  <tr key={`${f.codigoPais}-${f.asin}`} className="border-b border-white/[0.05] align-top">
                    <td className="px-2 py-2">
                      <Pais codigo={f.codigoPais} corto />
                    </td>
                    <td className="max-w-64 px-2 py-2">
                      <span className="block font-medium text-ink-100">{f.marca ?? f.asin}</span>
                      {f.titulo && (
                        <span className="block truncate text-[11px] text-ink-500" title={f.titulo}>
                          {f.marca ? `${f.asin} · ` : ""}
                          {f.titulo}
                        </span>
                      )}
                      {f.error && <span className={`block text-[11px] ${f.error.startsWith("No se vende") ? "text-ink-500" : "text-danger"}`}>{f.error}</span>}
                    </td>
                    <td className="px-2 py-2 text-xs whitespace-nowrap text-ink-300">
                      {f.paquete ? (
                        <>
                          {[f.paquete.largo, f.paquete.ancho, f.paquete.alto].map((x) => x.toLocaleString("es-ES")).join(" × ")} cm
                          <span className="block text-ink-500">{f.paquete.peso.toLocaleString("es-ES")} kg</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs text-ink-300">
                      {f.rankings.length
                        ? f.rankings.slice(0, 2).map((r) => (
                            <span key={r.categoria} className="block whitespace-nowrap">
                              #{formatNumero(r.rank)} <span className="text-ink-500">en {r.categoria}</span>
                            </span>
                          ))
                        : "—"}
                    </td>
                    <td className="px-2 py-2 text-right">{f.precio === null && f.ofertas === 0 ? <span className="text-xs whitespace-nowrap text-ink-500">sin ofertas</span> : dinero(f.precio, f.moneda)}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {f.ofertas ?? "—"}
                      {f.destacadaFba !== null && <span className="block text-[10px] text-ink-500">{f.destacadaFba ? "destacada: FBA" : "destacada: envío propio"}</span>}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {dinero(f.comision, f.moneda)}
                      {f.comision !== null && f.precioTarifas !== null && f.precioTarifas !== f.precio && (
                        <span className="block text-[10px] text-ink-500" title="Sin precio actual en ese país: tarifas calculadas a este precio">
                          a {dinero(f.precioTarifas, f.moneda)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-medium text-ink-100">{dinero(f.tarifaFba, f.moneda)}</td>
                    <td className="px-2 py-2">
                      <Evolucion puntos={puntos} moneda={f.moneda} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-ink-500">
            Tarifa FBA con stock en el país de venta (paneuropeo). Si envías a {nombrePais("FR")} o {nombrePais("ES")} desde un almacén alemán, Amazon cobra la tarifa entre países (EFN), más alta: la calculadora de Amazon la
            muestra en su opción «Red logística europea».
          </p>
        </>
      )}
    </Tarjeta>
  );
}
