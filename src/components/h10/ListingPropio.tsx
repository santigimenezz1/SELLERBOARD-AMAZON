"use client";

import { useEffect, useRef, useState } from "react";
import type { CodigoPais, DestinoPalabra, ListingPropio } from "@/lib/datos/h10Tipos";
import { formatNumero } from "@/lib/format";

/** How long after the last key the listing is saved. */
const ESPERA_TEXTO_MS = 800;
/** Amazon's usual limits (some categories allow less: check yours in Seller Central). */
export const LIMITES_LISTING = { titulo: 200, tituloMovil: 80, bullet: 500, backendBytes: 249 } as const;
const VACIO: ListingPropio = { titulo: "", bullets: ["", "", "", "", ""] };

/** Your listing of each country, saved with the study a moment after you stop typing. */
export function useListingPropio(estudioId: string, inicial: Partial<Record<CodigoPais, ListingPropio>>) {
  const [listings, setListings] = useState(inicial);
  const [estado, setEstado] = useState<"guardado" | "guardando" | "error">("guardado");
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cola = useRef<Promise<void>>(Promise.resolve());
  const pendiente = useRef<Partial<Record<CodigoPais, ListingPropio>> | null>(null);
  const enviar = (todos: Partial<Record<CodigoPais, ListingPropio>>, keepalive = false) =>
    fetch(`/api/h10/estudios/${estudioId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingPropio: todos }),
      keepalive,
    });
  const guardar = (todos: Partial<Record<CodigoPais, ListingPropio>>) => {
    setEstado("guardando");
    cola.current = cola.current.then(async () => {
      const r = await enviar(todos).catch(() => null);
      setEstado(r?.ok ? "guardado" : "error");
    });
  };
  // Leaving with something still waiting: saved anyway.
  useEffect(
    () => () => {
      if (espera.current && pendiente.current) {
        clearTimeout(espera.current);
        void enviar(pendiente.current, true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on leaving
    [estudioId],
  );
  return {
    estado,
    de: (pais: CodigoPais): ListingPropio => ({ ...VACIO, ...listings[pais], bullets: Array.from({ length: 5 }, (_, i) => listings[pais]?.bullets[i] ?? "") }),
    cambiar: (pais: CodigoPais, cambios: Partial<ListingPropio>) => {
      const todos = { ...listings, [pais]: { ...VACIO, ...listings[pais], ...cambios } };
      setListings(todos);
      pendiente.current = todos;
      if (espera.current) clearTimeout(espera.current);
      espera.current = setTimeout(() => guardar(todos), ESPERA_TEXTO_MS);
    },
  };
}
export type ListingsPropios = ReturnType<typeof useListingPropio>;

/** Text to compare words however they're written: lower case, no accents, «ß» as «ss», only letters and digits. */
const plano = (t: string) =>
  ` ${t
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;
const palabrasDe = (t: string) => plano(t).trim().split(" ").filter(Boolean);
/** «exacta»: the whole phrase as written; «palabras»: every word is there, not together; «falta»: a word is missing. */
type Presencia = "exacta" | "palabras" | "falta";
function presencia(texto: string, frase: string): Presencia {
  if (plano(texto).includes(plano(frase))) return "exacta";
  const hay = new Set(palabrasDe(texto));
  return palabrasDe(frase).every((p) => hay.has(p)) ? "palabras" : "falta";
}

/** Buttons that copy a text, saying so for a moment. */
function Copiar({ texto }: { texto: string }) {
  const [hecho, setHecho] = useState(false);
  return (
    <button
      onClick={() =>
        void navigator.clipboard.writeText(texto).then(() => {
          setHecho(true);
          setTimeout(() => setHecho(false), 1500);
        })
      }
      disabled={!texto.trim()}
      className="rounded-md px-2 py-1 text-xs text-accent-300 hover:bg-white/[0.06] disabled:opacity-40"
    >
      {hecho ? <span className="text-success">✓ Copiado</span> : "Copiar"}
    </button>
  );
}

/** «12 / 200» in red past the limit. */
function Contador({ n, max, extra }: { n: number; max: number; extra?: string }) {
  return (
    <span className={`tabular text-[11px] ${n > max ? "font-semibold text-danger" : "text-ink-500"}`}>
      {n} / {max}
      {extra && <span className="text-ink-600"> · {extra}</span>}
    </span>
  );
}

/** A keyword as a chip: green when it's in the text as written, amber when its words are there but apart, red when not. */
function Chip({ texto, p }: { texto: string; p: Presencia }) {
  const estilo = p === "exacta" ? "bg-success/15 text-success" : p === "palabras" ? "bg-warning/15 text-warning" : "bg-danger/15 text-danger";
  const ayuda = p === "exacta" ? "Está tal cual" : p === "palabras" ? "Están sus palabras, pero no juntas" : "No está";
  return (
    <span title={ayuda} className={`rounded-md px-2 py-0.5 text-xs ${estilo}`}>
      {p === "exacta" ? "✓" : p === "palabras" ? "≈" : "✕"} {texto}
    </span>
  );
}

const campo =
  "w-full resize-y rounded-lg border border-white/[0.08] bg-ink-950/50 px-3 py-2 text-sm leading-relaxed text-ink-100 placeholder:text-ink-600 focus:border-accent-500/60 focus:outline-none";
const encabezado = "border-b border-white/[0.06] pb-2 text-sm font-bold tracking-wide text-ink-100";

/** A launch keyword as the listing builder needs it: its text, where it goes and its monthly searches. */
export type PalabraDestino = { texto: string; destino?: DestinoPalabra; busquedas: number };

/**
 * The listing of one country: the title and its 5 bullets, written here and checked against the chosen keywords;
 * the search terms worked out from the «Backend» ones that aren't in the text yet; and how much of the chosen
 * keywords' searches the whole listing covers.
 */
export function ConstructorListing({ pais, palabras, listings }: { pais: CodigoPais; palabras: PalabraDestino[]; listings: ListingsPropios }) {
  const l = listings.de(pais);
  const conDestino = (...d: DestinoPalabra[]) => palabras.filter((p) => p.destino && d.includes(p.destino));
  const textoBullets = l.bullets.join(" \n ");
  const visible = l.titulo + " \n " + textoBullets;

  // Search terms: the words of the «Backend» keywords that aren't in the title or the bullets yet, each once.
  const yaEstan = new Set(palabrasDe(visible));
  const terminos: string[] = [];
  for (const p of conDestino("backend")) for (const w of palabrasDe(p.texto)) if (!yaEstan.has(w) && !terminos.includes(w)) terminos.push(w);
  const backend = terminos.join(" ");
  const bytes = new TextEncoder().encode(backend).length;
  const todo = `${visible} \n ${backend}`;

  // Coverage: the chosen keywords meant for the listing (not «only PPC») and their searches.
  const paraListing = palabras.filter((p) => p.destino !== "ppc");
  const cubiertas = paraListing.filter((p) => presencia(todo, p.texto) !== "falta");
  const totalBusquedas = paraListing.reduce((s, p) => s + p.busquedas, 0);
  const busquedasCubiertas = cubiertas.reduce((s, p) => s + p.busquedas, 0);
  const pct = totalBusquedas ? Math.round((busquedasCubiertas / totalBusquedas) * 100) : 0;
  const sinDestino = palabras.filter((p) => !p.destino).length;

  return (
    <div className="flex flex-col gap-6">
      {/* 2 · The listing */}
      <section className="flex flex-col gap-4">
        <h3 className={encabezado}>
          2 · LISTING
          <span className={`ml-2 text-xs font-normal ${listings.estado === "error" ? "text-danger" : "text-ink-500"}`}>
            {listings.estado === "guardando" ? "Guardando…" : listings.estado === "error" ? "No se pudo guardar: revisa la conexión" : ""}
          </span>
        </h3>

        {/* Title */}
        <div className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-ink-900/80 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink-100">Título</span>
            <span className="flex items-center gap-2">
              <Contador n={l.titulo.length} max={LIMITES_LISTING.titulo} extra={`en el móvil se ven unos ${LIMITES_LISTING.tituloMovil}`} />
              <Copiar texto={l.titulo} />
            </span>
          </div>
          <textarea
            value={l.titulo}
            onChange={(e) => listings.cambiar(pais, { titulo: e.target.value })}
            rows={2}
            maxLength={500}
            placeholder="Marca + palabra principal + lo que lo hace distinto + uso o público (lo importante, al principio)"
            className={campo}
          />
          {l.titulo.length > LIMITES_LISTING.tituloMovil && (
            <p className="text-[11px] text-ink-500">
              En el móvil se lee hasta aquí: «<span className="text-ink-300">{l.titulo.slice(0, LIMITES_LISTING.tituloMovil)}</span>…»
            </p>
          )}
          {conDestino("principal", "titulo").length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-ink-500">Para el título:</span>
              {conDestino("principal", "titulo").map((p) => (
                <Chip key={p.texto} texto={p.texto} p={presencia(l.titulo, p.texto)} />
              ))}
            </div>
          )}
        </div>

        {/* Bullets */}
        <div className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-ink-900/80 p-3">
          <span className="text-sm font-semibold text-ink-100">Bullets (viñetas)</span>
          {l.bullets.map((b, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-ink-400">Bullet {i + 1}</span>
                <span className="flex items-center gap-2">
                  <Contador n={b.length} max={LIMITES_LISTING.bullet} />
                  <Copiar texto={b} />
                </span>
              </div>
              <textarea
                value={b}
                onChange={(e) => listings.cambiar(pais, { bullets: l.bullets.map((x, n) => (n === i ? e.target.value : x)) })}
                rows={2}
                maxLength={1000}
                placeholder="BENEFICIO EN MAYÚSCULAS: explicación concreta, con medidas, materiales o para quién es…"
                className={campo}
              />
            </div>
          ))}
          {conDestino("bullets").length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-ink-500">Para los bullets:</span>
              {conDestino("bullets").map((p) => (
                <Chip key={p.texto} texto={p.texto} p={presencia(textoBullets, p.texto)} />
              ))}
            </div>
          )}
        </div>

        {/* Search terms */}
        <div className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-ink-900/80 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink-100">
              Términos de búsqueda (backend) <span className="text-xs font-normal text-ink-500">· se rellenan solos</span>
            </span>
            <span className="flex items-center gap-2">
              <span className={`tabular text-[11px] ${bytes > LIMITES_LISTING.backendBytes ? "font-semibold text-danger" : "text-ink-500"}`}>
                {bytes} / {LIMITES_LISTING.backendBytes} bytes
              </span>
              <Copiar texto={backend} />
            </span>
          </div>
          <p className="min-h-10 rounded-lg border border-white/[0.06] bg-ink-950/50 px-3 py-2 font-mono text-xs leading-relaxed text-ink-200">
            {backend || (
              <span className="font-sans text-ink-600">
                Marca palabras como «Backend»: aquí saldrán sus palabras que no estén ya en el título ni en los bullets.
              </span>
            )}
          </p>
          {bytes > LIMITES_LISTING.backendBytes && (
            <p className="text-[11px] text-danger">
              Pasa del límite: Amazon ignora todo si lo excede. Quita alguna palabra de «Backend» o llévala a los bullets.
            </p>
          )}
          <p className="text-[11px] text-ink-500">Sin comas ni palabras repetidas: Amazon ya combina las palabras entre sí y con las del título.</p>
        </div>
      </section>

      {/* 3 · Coverage */}
      <section className="flex flex-col gap-3">
        <h3 className={encabezado}>3 · COBERTURA</h3>
        {paraListing.length === 0 ? (
          <p className="text-sm text-ink-400">Asigna un destino a tus palabras (arriba) para ver qué parte de sus búsquedas cubre el listing.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`text-3xl font-bold tracking-tight ${pct >= 80 ? "text-success" : pct >= 50 ? "text-warning" : "text-danger"}`}>{pct} %</span>
              <span className="text-sm text-ink-300">
                de las búsquedas de tus palabras están en el listing ({formatNumero(busquedasCubiertas)} de {formatNumero(totalBusquedas)} al mes ·{" "}
                {cubiertas.length} de {paraListing.length} palabras)
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div className={`h-full rounded-full ${pct >= 80 ? "bg-success" : pct >= 50 ? "bg-warning" : "bg-danger"}`} style={{ width: `${pct}%` }} />
            </div>
            {paraListing.length > cubiertas.length && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-ink-500">Faltan en todo el listing:</span>
                {paraListing
                  .filter((p) => presencia(todo, p.texto) === "falta")
                  .map((p) => (
                    <Chip key={p.texto} texto={p.texto} p="falta" />
                  ))}
              </div>
            )}
            {sinDestino > 0 && (
              <p className="text-[11px] text-warning">
                {sinDestino} {sinDestino === 1 ? "palabra no tiene" : "palabras no tienen"} destino todavía: se cuentan como «para el listing».
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
