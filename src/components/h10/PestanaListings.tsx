"use client";

import { useState } from "react";
import Link from "next/link";
import type { CodigoPais, EstudioH10, PalabrasMercado } from "@/lib/datos/h10Tipos";
import { EUR_POR_GBP, nombrePais } from "@/lib/datos/h10Analisis";
import { auditarListing, colorNota, resumenListings } from "@/lib/datos/h10Listings";
import { formatMoneda, formatNumero } from "@/lib/format";
import { Pais, Tarjeta } from "./comun";
import { FotoGenerica } from "./FotoGenerica";

/**
 * «Listings»: the 10 leaders of the niche as cards, from the one that earns most, each opening its listing audit; at the
 * end, what the leaders get wrong and what they get right. A mock-up until the listing agent exists.
 */
export function PestanaListings({ estudio, palabras }: { estudio: EstudioH10; palabras: Record<string, PalabrasMercado> }) {
  const [pais, setPais] = useState<CodigoPais | null>(null);
  const lideres = estudio.mercados
    .filter((m) => !pais || m.codigoPais === pais)
    .flatMap((m) => m.competidores.map((c) => ({ m, c, eur: m.moneda === "GBP" ? c.facturacion * EUR_POR_GBP : c.facturacion })))
    .sort((a, b) => b.eur - a.eur)
    .slice(0, 10)
    .map((x) => ({ ...x, a: auditarListing(x.c, x.m, palabras[x.m.codigoPais]) }));
  const { fallos, aciertos } = resumenListings(lideres.map((x) => x.a));
  const donde = pais ? `en ${nombrePais(pais)}` : "del nicho";

  return (
    <div className="flex flex-col gap-4">
      <p className="w-fit rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
        Simulación · fotos genéricas y hallazgos de ejemplo; el título se analiza de verdad con las palabras clave del estudio
      </p>

      <div className="flex flex-wrap gap-1.5">
        {[null, ...estudio.mercados.map((m) => m.codigoPais)].map((p) => (
          <button
            key={p ?? "todos"}
            onClick={() => setPais(p)}
            aria-pressed={pais === p}
            className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${pais === p ? "border-accent-500/60 bg-accent-500/10 font-medium text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
          >
            {p ? <Pais codigo={p} /> : "Todos los países"}
          </button>
        ))}
      </div>

      <Tarjeta titulo={`Los 10 listings líderes ${donde}`} subtitulo="De más a menos facturación · entra en uno para ver todo lo que hace bien y mal">
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {lideres.map(({ m, c, a }, i) => {
            const enlace = c.asin ? `/analisis-h10/${estudio.id}/listing/${m.codigoPais}/${c.asin}` : null;
            const malos = a.partes.reduce((t, p) => t + p.mal.length, 0);
            const buenos = a.partes.reduce((t, p) => t + p.bien.length, 0);
            const contenido = (
              <>
                <div className="relative">
                  <FotoGenerica tono={i} />
                  <span className="absolute top-2 left-2 flex size-7 items-center justify-center rounded-full bg-ink-950/85 text-xs font-bold text-ink-50">{i + 1}</span>
                  {/* Dark chip with the score's colour, readable on any photo. */}
                  <span className={`absolute top-2 right-2 rounded-full bg-ink-950/85 px-2 py-0.5 text-xs font-bold ${colorNota(a.nota).split(" ")[1]}`}>{a.nota.toLocaleString("es-ES")}</span>
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-ink-50">{c.marca}</span>
                    <Pais codigo={m.codigoPais} corto />
                  </span>
                  <span className="line-clamp-2 text-xs text-ink-400" title={c.titulo}>
                    {c.titulo}
                  </span>
                  <span className="tabular mt-auto flex flex-wrap items-center gap-x-2 text-xs text-ink-300">
                    <span className="font-semibold text-ink-100">{formatMoneda(c.precio, m.moneda)}</span>
                    {c.valoracion ? (
                      <span>
                        <span className="text-accent-400">★</span> {c.valoracion.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </span>
                    ) : null}
                    <span>{formatNumero(c.resenas)} reseñas</span>
                  </span>
                  <span className="tabular text-xs text-ink-400">{formatMoneda(c.facturacion, m.moneda)}/mes</span>
                  <span className="flex gap-1.5 text-[11px]">
                    <span className="rounded bg-danger/10 px-1.5 py-0.5 font-medium text-danger">{malos} fallos</span>
                    <span className="rounded bg-success/10 px-1.5 py-0.5 font-medium text-success">{buenos} aciertos</span>
                  </span>
                </div>
              </>
            );
            const clase = "flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-ink-950/40 transition-colors";
            return enlace ? (
              <Link key={`${m.codigoPais}-${c.asin}`} href={enlace} className={`${clase} hover:border-accent-500/50 hover:bg-white/[0.03]`}>
                {contenido}
              </Link>
            ) : (
              <div key={`${m.codigoPais}-${c.puesto}-${i}`} className={clase}>
                {contenido}
              </div>
            );
          })}
        </div>
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo={`En qué fallan los líderes ${donde}`} subtitulo="Lo que más se repite entre los 10: cada fallo es una oportunidad para tu listing">
          <ol className="mt-3 flex flex-col gap-2.5">
            {fallos.slice(0, 10).map((f) => (
              <li key={`${f.parte}-${f.texto}`} className="flex flex-col gap-1">
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink-100">
                    <span className="text-danger">− </span>
                    {f.texto}
                  </span>
                  <span className="shrink-0 text-xs text-ink-400">
                    <strong className="text-danger">{f.listings}</strong> de {lideres.length}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <span className="block h-full rounded-full bg-danger" style={{ width: `${(f.listings / Math.max(1, lideres.length)) * 100}%` }} />
                  </span>
                  <span className="w-24 text-right text-[11px] text-ink-500">{f.parte}</span>
                </span>
              </li>
            ))}
          </ol>
        </Tarjeta>
        <Tarjeta titulo={`Lo que hacen bien los líderes ${donde}`} subtitulo="Lo mínimo que tu listing tiene que igualar">
          <ol className="mt-3 flex flex-col gap-2.5">
            {aciertos.slice(0, 10).map((f) => (
              <li key={`${f.parte}-${f.texto}`} className="flex flex-col gap-1">
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink-100">
                    <span className="text-success">+ </span>
                    {f.texto}
                  </span>
                  <span className="shrink-0 text-xs text-ink-400">
                    <strong className="text-success">{f.listings}</strong> de {lideres.length}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <span className="block h-full rounded-full bg-success" style={{ width: `${(f.listings / Math.max(1, lideres.length)) * 100}%` }} />
                  </span>
                  <span className="w-24 text-right text-[11px] text-ink-500">{f.parte}</span>
                </span>
              </li>
            ))}
          </ol>
        </Tarjeta>
      </div>
    </div>
  );
}
