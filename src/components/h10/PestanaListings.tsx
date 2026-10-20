"use client";

import { useEffect, useState } from "react";
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
 * «Listings»: the leaders of the niche (TOP at first, MAS more per click) as cards, from the one that earns most, each opening its listing audit; at the
 * end, what the leaders get wrong and what they get right. A card's ✕ takes that listing out (kept per study) and the
 * next one by revenue fills its place. Each card shows its revenue and its share of the market: of every product of
 * every country under «Todos», of that country's otherwise (as in «Competidores»). Photos and texts are the real ones when a «ficha» JSON
 * brought the listing; the findings are a mock-up until the listing agent exists.
 */
/** How many leaders the tab shows at first; «Agregar 10 competidores más» adds MAS each time (remembered per study, in this browser). */
const TOP = 25;
const MAS = 10;

/**
 * `conExtension`: «Conectar extensión», which hands out the extension's key (the owner's: not for guests). The
 * automatic load is always there: it only opens Amazon, and whoever runs it signs with the key in their own extension
 * (the owner loads a guest's reviews signed in as the guest, from his Chrome).
 */
export function PestanaListings({ estudio, palabras, conExtension = true }: { estudio: EstudioH10; palabras: Record<string, PalabrasMercado>; conExtension?: boolean }) {
  const router = useRouter();
  const [pais, setPais] = useState<CodigoPais | null>(null);
  // Shown at once; saved in the study in the background.
  const [quitados, setQuitados] = useState<string[]>(estudio.listingsQuitados ?? []);
  const [errorQuitar, setErrorQuitar] = useState("");
  const [cuantos, setCuantos] = useState(TOP);
  const memoria = `h10-listings-cuantos-${estudio.id}`;
  useEffect(() => {
    try {
      const n = Number(localStorage.getItem(memoria));
      if (n > TOP) setCuantos(n);
    } catch {}
  }, [memoria]);
  const agregarMas = () => {
    const n = cuantos + MAS;
    setCuantos(n);
    try {
      localStorage.setItem(memoria, String(n));
    } catch {}
  };
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
  const visibles = todos.filter((x) => !x.c.asin || !quitados.includes(clave(x)));
  const lideres = visibles
    .slice(0, cuantos)
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

      {conExtension && <ConectarExtension />}
      <CargaAutomatica
        estudio={estudio}
        cuantos={cuantos}
        // Each country's own top (by revenue, without the ones taken out with ✕), whatever the view shows.
        porPais={estudio.mercados.map((m) => ({
          pais: m.codigoPais,
          items: [...m.competidores]
            .filter((c) => c.asin && !quitados.includes(`${m.codigoPais}|${c.asin}`))
            .sort((a, b) => b.facturacion - a.facturacion)
            .filter((c, i, l) => l.findIndex((x) => x.asin === c.asin) === i)
            .slice(0, cuantos)
            .map((c) => ({
              pais: m.codigoPais,
              asin: c.asin!,
              guardadas: Math.max(0, ...(estudio.resenasCompletas ?? []).filter((r) => r.codigoPais === m.codigoPais && r.asin === c.asin).map((r) => r.total)),
            })),
        }))}
      />

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
        titulo={`Los ${lideres.length} listings líderes ${donde}`}
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
                    aria-label={`Quitar ${c.marca} del top ${cuantos}`}
                    title={`Quitar del top ${cuantos}: lo sustituye el siguiente por facturación`}
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
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-ink-400">
          {visibles.length > lideres.length ? (
            <button
              onClick={agregarMas}
              className="h-9 rounded-lg border border-accent-500/50 bg-accent-500/10 px-4 text-sm font-semibold text-ink-100 transition-colors hover:bg-accent-500/20"
              title="Suma los 10 siguientes por facturación (se recuerda en este estudio)"
            >
              + Agregar {Math.min(MAS, visibles.length - lideres.length)} competidores más
            </button>
          ) : null}
          <span>
            {lideres.length} de {visibles.length} listings con datos {donde}
            {visibles.length <= lideres.length ? " · no hay más en los datos de Helium 10" : ""}
          </span>
        </div>
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo={`En qué fallan los líderes ${donde}`} subtitulo={`Lo que más se repite entre los ${lideres.length}: cada fallo es una oportunidad para tu listing`}>
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

const DOMINIO_AMAZON: Record<string, string> = { ES: "amazon.es", DE: "amazon.de", FR: "amazon.fr", IT: "amazon.it", GB: "amazon.co.uk" };

type ItemCarga = { pais: CodigoPais; asin: string; guardadas: number };

/**
 * «Cargar reseñas automáticamente»: every country's top listings one country after another, or one country's. Opens
 * the first one's reviews in Amazon with the whole list in the link (#evlc_auto=…); the review extension (1.5+) then
 * goes through every product by itself (1★ to 5★, up to 10 pages each, at a person's pace), sends each one to this
 * study and moves on, to the next country too; it waits whenever Amazon asks to sign in.
 */
function CargaAutomatica({ estudio, cuantos, porPais }: { estudio: EstudioH10; cuantos: number; porPais: { pais: CodigoPais; items: ItemCarga[] }[] }) {
  const [saltarGuardados, setSaltarGuardados] = useState(true);
  /** The list about to start: every country («todos») or one; null while none is picked. */
  const [elegida, setElegida] = useState<"todos" | CodigoPais | null>(null);
  const pendientes = (items: ItemCarga[]) => items.filter((x) => !saltarGuardados || !x.guardadas);
  const deTodos = porPais.flatMap((p) => pendientes(p.items));
  const cola = elegida === "todos" ? deTodos : pendientes(porPais.find((p) => p.pais === elegida)?.items ?? []);
  const minutos = (n: number) => (n * 2 >= 60 ? `≈ ${Math.round((n * 2) / 6) / 10} h` : `≈ ${n * 2} min`);
  const empezar = () => {
    setElegida(null);
    const primero = cola[0];
    if (!primero) return;
    const marca = JSON.stringify({ e: estudio.id, n: estudio.nombre, a: window.location.origin, c: cola.map((x) => [x.pais, x.asin]) });
    // The same page the extension starts from: the first product's 1-star reviews, newest first.
    const url = `https://www.${DOMINIO_AMAZON[primero.pais]}/product-reviews/${primero.asin}/?ie=UTF8&reviewerType=all_reviews&filterByStar=one_star&sortBy=recent&pageNumber=1#evlc_auto=${encodeURIComponent(marca)}`;
    window.open(url, "_blank", "noopener");
  };
  return (
    <div className="rounded-xl border border-accent-500/30 bg-accent-500/[0.05] px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-ink-300">
          <span className="font-semibold text-ink-100">Carga automática de reseñas:</span> la extensión abre Amazon y recorre sola las reseñas de los {cuantos} listings más fuertes de cada
          país, uno tras otro. Si Amazon pide iniciar sesión, lo haces tú y sigue.
        </span>
        <label className="flex items-center gap-1.5 text-xs text-ink-400">
          <input type="checkbox" checked={saltarGuardados} onChange={(e) => setSaltarGuardados(e.target.checked)} />
          Saltar los que ya tienen reseñas
        </label>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setElegida("todos")}
          disabled={!deTodos.length}
          className="h-8 rounded-lg bg-accent-500 px-3 text-xs font-semibold text-ink-950 hover:bg-accent-400 disabled:opacity-50"
          title="Todos los países, uno detrás de otro"
        >
          Todos los países · {deTodos.length} listings ({minutos(deTodos.length)})
        </button>
        {porPais.map((p) => {
          const n = pendientes(p.items).length;
          return (
            <button
              key={p.pais}
              onClick={() => setElegida(p.pais)}
              disabled={!n}
              title={n ? `Los ${n} de ${nombrePais(p.pais)} (${minutos(n)})` : `Los de ${nombrePais(p.pais)} ya tienen reseñas`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.12] px-2.5 text-xs font-medium text-ink-100 hover:border-accent-500/60 disabled:opacity-40"
            >
              <Pais codigo={p.pais} corto /> Cargar {n === p.items.length ? `los ${n}` : `${n} de ${p.items.length}`}
            </button>
          );
        })}
      </div>
      {elegida && (
        <div role="alertdialog" className="mt-3 flex flex-col gap-2 border-t border-white/[0.06] pt-3 text-xs text-ink-300">
          <p>
            Vas a cargar <strong className="text-ink-100">{cola.length} listings</strong>{" "}
            {elegida === "todos" ? `de ${porPais.filter((p) => pendientes(p.items).length).map((p) => nombrePais(p.pais)).join(", ")}, país por país` : `de ${nombrePais(elegida)}`} ({minutos(cola.length)}).
            Antes de empezar: la extensión tiene que estar en la <strong className="text-ink-100">versión 1.7</strong> (↻ en chrome://extensions) y con la clave pegada en ⚙. Usa una{" "}
            <strong className="text-ink-100">cuenta de comprador de Amazon, no la de vendedor</strong>. Deja esa pestaña trabajar; puedes usar otras.
          </p>
          <span className="flex gap-2">
            <button onClick={empezar} disabled={!cola.length} className="h-8 rounded-lg bg-accent-500 px-3 font-semibold text-ink-950 hover:bg-accent-400 disabled:opacity-50">
              Empezar
            </button>
            <button onClick={() => setElegida(null)} className="h-8 rounded-lg border border-white/[0.12] px-3 text-ink-300 hover:text-ink-100">
              Cancelar
            </button>
          </span>
        </div>
      )}
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
