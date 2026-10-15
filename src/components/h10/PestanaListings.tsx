"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CodigoPais, EstudioH10, PalabrasMercado } from "@/lib/datos/h10Tipos";
import { EUR_POR_GBP, nombrePais } from "@/lib/datos/h10Analisis";
import { auditarListing, colorNota, listingDe, resumenListings } from "@/lib/datos/h10Listings";
import { formatMoneda, formatNumero, formatPorcentaje } from "@/lib/format";
import { enlaceAmazon } from "@/lib/datos/h10Enlaces";
import { Pais, Tarjeta } from "./comun";
import { FotoGenerica } from "./FotoGenerica";

/**
 * «Listings»: the 10 leaders of the niche as cards, from the one that earns most, each opening its listing audit; at the
 * end, what the leaders get wrong and what they get right. A card's ✕ takes that listing out (kept per study) and the
 * next one by revenue fills its place. Each card shows its revenue and its share of the market: of every product of
 * every country under «Todos», of that country's otherwise (as in «Competidores»). Photos and texts are the real ones when a «ficha» JSON
 * brought the listing; the findings are a mock-up until the listing agent exists.
 */
export function PestanaListings({ estudio, palabras }: { estudio: EstudioH10; palabras: Record<string, PalabrasMercado> }) {
  const router = useRouter();
  const [pais, setPais] = useState<CodigoPais | null>(null);
  // Shown at once; saved in the study in the background.
  const [quitados, setQuitados] = useState<string[]>(estudio.listingsQuitados ?? []);
  const [errorQuitar, setErrorQuitar] = useState("");
  const todos = estudio.mercados
    .filter((m) => !pais || m.codigoPais === pais)
    .flatMap((m) => m.competidores.map((c) => ({ m, c, eur: m.moneda === "GBP" ? c.facturacion * EUR_POR_GBP : c.facturacion })))
    .sort((a, b) => b.eur - a.eur);
  // The whole market of the view, taken-out listings included: taking one out doesn't change the market.
  const totalMercado = todos.reduce((t, x) => t + x.eur, 0);
  const clave = (x: { m: { codigoPais: string }; c: { asin?: string | null } }) => `${x.m.codigoPais}|${x.c.asin}`;
  const quitadosAqui = todos.filter((x) => x.c.asin && quitados.includes(clave(x))).length;
  const guardar = async (cambio: { quitarListing: string } | { restaurarListings: true }, despues: string[]) => {
    const antes = quitados;
    setQuitados(despues);
    setErrorQuitar("");
    try {
      const r = await fetch(`/api/h10/estudios/${estudio.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambio) });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(b.error ?? `error ${r.status}`);
      router.refresh();
    } catch (e) {
      setQuitados(antes);
      setErrorQuitar(`No se pudo guardar: ${e instanceof Error ? e.message : "inténtalo otra vez"}`);
    }
  };
  const lideres = todos
    .filter((x) => !x.c.asin || !quitados.includes(clave(x)))
    .slice(0, 10)
    .map((x) => ({ ...x, a: auditarListing(x.c, x.m, palabras[x.m.codigoPais], listingDe(estudio.listings, x.m.codigoPais, x.c.asin)) }));
  const { fallos, aciertos } = resumenListings(lideres.map((x) => x.a));
  const donde = pais ? `en ${nombrePais(pais)}` : "del nicho";
  const reales = lideres.filter((x) => x.a.real).length;

  return (
    <div className="flex flex-col gap-4">
      <p className="w-fit rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
        {reales
          ? `Fotos y textos reales de Amazon en ${reales} de ${lideres.length} · los fallos y aciertos aún son de ejemplo (salvo el título, las fotos usadas, los bullets, el A+ y el vídeo)`
          : "Simulación · fotos genéricas y hallazgos de ejemplo; el título se analiza de verdad con las palabras clave del estudio"}
      </p>

      <ConectarExtension />

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

      <Tarjeta
        titulo={`Los 10 listings líderes ${donde}`}
        subtitulo="De más a menos facturación · entra en uno para ver todo lo que hace bien y mal · ✕ para quitarlo: su sitio lo ocupa el siguiente"
      >
        {(quitadosAqui > 0 || errorQuitar) && (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-400">
            {quitadosAqui > 0 && (
              <>
                {quitadosAqui} {quitadosAqui === 1 ? "listing quitado" : "listings quitados"} {donde}
                <button
                  onClick={() => void guardar({ restaurarListings: true }, [])}
                  className="rounded-md border border-white/[0.12] px-2 py-0.5 font-medium text-ink-200 hover:text-ink-50"
                  title="Vuelve a mostrar todos los listings quitados de este estudio (en todos los países)"
                >
                  Volver a mostrarlos
                </button>
              </>
            )}
            {errorQuitar && <span className="text-danger">{errorQuitar}</span>}
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {lideres.map(({ m, c, a, eur }, i) => {
            const enlace = c.asin ? `/analisis-h10/${estudio.id}/listing/${m.codigoPais}/${c.asin}` : null;
            const malos = a.partes.reduce((t, p) => t + p.mal.length, 0);
            const buenos = a.partes.reduce((t, p) => t + p.bien.length, 0);
            const contenido = (
              <>
                <div className="flex items-baseline justify-between gap-2 px-3 pt-2.5 pb-2 pr-10">
                  <span
                    className="tabular text-lg leading-none font-bold text-success"
                    title={m.moneda === "GBP" ? `Al mes, pasado a euros (${formatMoneda(c.facturacion, m.moneda)})` : "Facturación al mes (Xray)"}
                  >
                    {formatNumero(eur)} €
                  </span>
                  <span className="tabular text-xs font-semibold text-ink-200" title={pais ? `Parte de lo que factura el mercado de ${nombrePais(pais)}` : "Parte de lo que factura el mercado de todos los países juntos"}>
                    {formatPorcentaje(totalMercado ? (eur / totalMercado) * 100 : null)}
                  </span>
                </div>
                <div className="relative">
                  <FotoGenerica tono={i} url={a.real?.fotos[0]} />
                  <span className="absolute top-2 left-2 flex size-7 items-center justify-center rounded-full bg-ink-950/85 text-xs font-bold text-ink-50">{i + 1}</span>
                  {/* Dark chip with the score's colour, readable on any photo. */}
                  <span className={`absolute top-2 right-2 rounded-full bg-ink-950/85 px-2 py-0.5 text-xs font-bold ${colorNota(a.nota).split(" ")[1]}`}>{a.nota.toLocaleString("es-ES")}</span>
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-ink-50">{c.marca}</span>
                    <Pais codigo={m.codigoPais} corto />
                  </span>
                  <span className="line-clamp-2 text-xs text-ink-400" title={a.titulo}>
                    {a.titulo}
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
                  <span className="flex gap-1.5 text-[11px]">
                    <span className="rounded bg-danger/10 px-1.5 py-0.5 font-medium text-danger">{malos} fallos</span>
                    <span className="rounded bg-success/10 px-1.5 py-0.5 font-medium text-success">{buenos} aciertos</span>
                  </span>
                </div>
              </>
            );
            // Reviews of this ASIN already in the study (the largest upload: Helium 10's or the extension's).
            const guardadas = Math.max(0, ...(estudio.resenasCompletas ?? []).filter((r) => r.codigoPais === m.codigoPais && r.asin === c.asin).map((r) => r.total));
            return (
              <div key={`${m.codigoPais}-${c.asin ?? c.puesto}-${i}`} className="relative flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-ink-950/40 transition-colors hover:border-accent-500/50">
                {c.asin && (
                  <button
                    onClick={() => {
                      const k = `${m.codigoPais}|${c.asin}`;
                      void guardar({ quitarListing: k }, [...quitados, k]);
                    }}
                    aria-label={`Quitar ${c.marca} del top 10`}
                    title="Quitar del top 10: lo sustituye el siguiente por facturación"
                    className="absolute top-1.5 right-1.5 z-10 flex size-7 items-center justify-center rounded-full text-base leading-none text-ink-400 transition-colors hover:bg-danger/15 hover:text-danger"
                  >
                    ✕
                  </button>
                )}
                {enlace ? (
                  <Link href={enlace} className="flex flex-1 flex-col hover:bg-white/[0.03]">
                    {contenido}
                  </Link>
                ) : (
                  <div className="flex flex-1 flex-col">{contenido}</div>
                )}
                {c.asin && (
                  <div className="flex flex-col gap-1.5 border-t border-white/[0.06] p-3 pt-2.5">
                    {guardadas ? (
                      <Link href={`/analisis-h10/${estudio.id}/competidor/${m.codigoPais}/${c.asin}`} className="text-[11px] font-semibold text-success hover:underline" title="Ver todas sus reseñas y lo que dicen en cada estrella">
                        ✓ {formatNumero(guardadas)} reseñas guardadas →
                      </Link>
                    ) : (
                      <span className="text-[11px] text-ink-500">Sin reseñas guardadas</span>
                    )}
                    <a
                      href={enlaceAmazon(m.codigoPais, c.asin)}
                      target="_blank"
                      rel="noopener"
                      // The extension reads where to send the reviews from this mark (study, its name and this app's address).
                      onClick={(e) => {
                        const marca = new URLSearchParams({ evlc_estudio: estudio.id, evlc_nombre: estudio.nombre, evlc_app: window.location.origin });
                        e.currentTarget.href = `${enlaceAmazon(m.codigoPais, c.asin)}#${marca}`;
                      }}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-accent-500 px-2.5 text-xs font-semibold text-ink-950 transition-all hover:bg-accent-400 active:scale-[0.97]"
                    >
                      Abrir en Amazon ↗
                    </a>
                  </div>
                )}
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

/**
 * «Conectar extensión»: shows the key the review-recorder extension signs with, to paste into it once, and this
 * app's address. A new key stops the old one.
 */
function ConectarExtension() {
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copiada, setCopiada] = useState(false);

  const pedir = async (nueva: boolean) => {
    if (nueva && !confirm("¿Generar una clave nueva? La extensión dejará de poder enviar hasta que pegues la nueva.")) return;
    setError("");
    try {
      const r = await fetch("/api/extension/clave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nueva }) });
      const b = (await r.json().catch(() => ({}))) as { clave?: string; error?: string };
      if (!r.ok || !b.clave) throw new Error(b.error ?? `error ${r.status}`);
      setClave(b.clave);
      setCopiada(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo obtener la clave");
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.08] bg-ink-950/40 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-ink-300">
          <span className="font-semibold text-ink-100">Reseñas con la extensión:</span> «Abrir en Amazon» en un listing, entra en sus reseñas, grábalas y pulsa «Enviar a la app».
        </span>
        <button
          onClick={() => {
            setAbierto((x) => !x);
            if (!clave) void pedir(false);
          }}
          className="h-8 rounded-lg border border-white/[0.12] px-3 text-xs font-medium text-ink-200 hover:text-ink-50"
        >
          {abierto ? "Ocultar" : "Conectar extensión"}
        </button>
      </div>
      {abierto && (
        <div className="mt-3 flex flex-col gap-2 border-t border-white/[0.06] pt-3">
          <p className="text-xs text-ink-400">Pega esta clave en la extensión (⚙ del recuadro de Amazon). Solo hace falta una vez.</p>
          {clave && (
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-md bg-ink-900 px-2.5 py-1.5 font-mono text-xs break-all text-ink-100">{clave}</code>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(clave).then(() => setCopiada(true));
                }}
                className="h-8 rounded-lg bg-success px-3 text-xs font-semibold text-ink-950 hover:brightness-110"
              >
                {copiada ? "✓ Copiada" : "Copiar"}
              </button>
              <button onClick={() => void pedir(true)} className="h-8 rounded-lg border border-white/[0.12] px-3 text-xs text-ink-300 hover:text-ink-100">
                Generar otra
              </button>
            </div>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
