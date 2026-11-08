"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CodigoPais, EstudioH10, KitCompetidor, QuejasPorEstrellas } from "@/lib/datos/h10Tipos";
import { claveCuantosListings, lideresListings, listingDe, TOP_LISTINGS } from "@/lib/datos/h10Listings";
import { formatMoneda, formatNumero } from "@/lib/format";
import { enlaceAmazon } from "@/lib/datos/h10Enlaces";
import { Pais } from "./comun";

/** Amazon serves any photo smaller with a size before the extension: 300 px is plenty for a card. */
const pequena = (url: string) => url.replace(/^(https:\/\/m\.media-amazon\.com\/images\/I\/[^.]+)(\.[a-z]+)$/i, "$1._SL300_$2");

/** «2 × Portería · 120×90 cm» as a chip. */
function Elemento({ e }: { e: KitCompetidor["elementos"][number] }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-ink-950/50 px-2 py-0.5 text-xs text-ink-100">
      {e.cantidad !== null && <strong className="text-accent-300">{e.cantidad}×</strong>}
      {e.nombre}
      {e.detalle && <span className="text-ink-400">· {e.detalle}</span>}
    </span>
  );
}

/** Where a listing's full reviews are: the country they were uploaded in (its own first) and how many. */
export type ResenasListing = { pais: CodigoPais; total: number };

/** Every complaint the AI found in a listing's reviews, joined across stars, the most repeated first. */
function quejasDe(d: QuejasPorEstrellas) {
  const porTexto = new Map<string, { texto: string; resenas: number; porEstrella: Record<number, number>; ejemplo: string | null }>();
  for (const g of d.grupos)
    for (const t of g.temas) {
      if (t.tipo === "elogio") continue;
      const q = porTexto.get(t.texto) ?? { texto: t.texto, resenas: 0, porEstrella: {}, ejemplo: t.ejemplo };
      q.resenas += t.resenas;
      q.porEstrella[g.estrellas] = (q.porEstrella[g.estrellas] ?? 0) + t.resenas;
      q.ejemplo ??= t.ejemplo;
      porTexto.set(t.texto, q);
    }
  return [...porTexto.values()].sort((a, b) => b.resenas - a.resenas);
}

/**
 * «Leer reseñas» of one listing: what its buyers complain about, from its full reviews only. Uses the analysis
 * already made for it (no cost); without one, says how many reviews the AI would read and what it costs, and runs it.
 */
function QuejasListing({ estudioId, asin, r }: { estudioId: string; asin: string; r: ResenasListing }) {
  const [estado, setEstado] = useState<"cargando" | "presupuesto" | "analizando" | "listo" | "error">("cargando");
  const [datos, setDatos] = useState<QuejasPorEstrellas | null>(null);
  const [coste, setCoste] = useState<{ resenas: number; dolares: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/h10/estudios/${estudioId}/estrellas`;
  const leer = async () => {
    const g = (await fetch(`${url}?pais=${r.pais}&asin=${asin}`)
      .then((x) => x.json())
      .catch(() => null)) as { datos?: QuejasPorEstrellas | null; error?: string } | null;
    if (g?.datos) {
      setDatos(g.datos);
      setEstado("listo");
      return;
    }
    // Not read yet: what reading all of them would cost, to ask first.
    const e = (await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pais: r.pais, asin, estimar: true }),
    })
      .then((x) => x.json())
      .catch(() => null)) as { todas?: { resenas: number; dolares: number }; error?: string } | null;
    if (!e?.todas) {
      setError(e?.error ?? g?.error ?? "No se pudieron leer las reseñas");
      setEstado("error");
      return;
    }
    setCoste(e.todas);
    setEstado("presupuesto");
  };
  const analizar = async () => {
    setEstado("analizando");
    const x = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pais: r.pais, asin, modo: "todas" }),
    }).catch(() => null);
    const b = (await x?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!x?.ok) {
      setError(b?.error ?? "No se pudieron analizar las reseñas");
      setEstado("error");
      return;
    }
    await leer();
  };
  // When it opens: look for what's already read (the reading itself sets the state, after the requests).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the state changes only after the requests answer
    void leer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the panel opens
  }, []);

  if (estado === "cargando") return <p className="text-xs text-ink-400">Buscando las reseñas leídas…</p>;
  if (estado === "error") return <p className="text-xs text-danger">{error}</p>;
  if (estado === "presupuesto" && coste)
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-300">
        Aún no se han analizado. La IA leerá sus {formatNumero(coste.resenas)} reseñas: cuesta unos{" "}
        <strong>{coste.dolares < 0.01 ? "0,01" : coste.dolares.toLocaleString("es-ES", { maximumFractionDigits: 2 })} $</strong>.
        <button onClick={() => void analizar()} className="rounded-md bg-accent-500 px-2.5 py-1 font-medium text-ink-950 hover:bg-accent-400">
          Analizar
        </button>
      </div>
    );
  if (estado === "analizando") return <p className="text-xs text-ink-400">Leyendo las reseñas… (con muchas, puede tardar un minuto)</p>;
  if (!datos) return null;
  const quejas = quejasDe(datos);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-ink-500">
        {formatNumero(datos.analizadas)} reseñas leídas el {new Date(datos.generadoEn).toLocaleDateString("es-ES")}
        {r.pais && ` (Amazon ${r.pais})`}. El número es cuántas reseñas lo dicen.
      </p>
      {quejas.length === 0 ? (
        <p className="text-xs text-ink-400">No se quejan de nada concreto.</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {quejas.map((q) => {
            const pct = datos.analizadas ? Math.round((q.resenas / datos.analizadas) * 100) : 0;
            return (
              <li key={q.texto} className="flex flex-col gap-0.5">
                <span className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-ink-100">
                    <span className="text-danger">− </span>
                    {q.texto}
                  </span>
                  <span className="tabular shrink-0 text-xs text-ink-300">
                    <strong className="text-danger">{formatNumero(q.resenas)}</strong> · {pct} %
                  </span>
                </span>
                <span className="flex flex-wrap gap-1 text-[10px] text-ink-500">
                  {Object.entries(q.porEstrella)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([e, n]) => (
                      <span key={e}>
                        {e}★ {n}
                      </span>
                    ))}
                </span>
                {q.ejemplo && <span className="line-clamp-2 text-[11px] text-ink-500 italic">«{q.ejemplo}»</span>}
              </li>
            );
          })}
        </ol>
      )}
      <Link href={`/analisis-h10/${estudioId}/competidor/${r.pais}/${asin}`} className="self-start text-[11px] text-accent-300 hover:underline">
        Ver el análisis completo por estrellas (también lo que les gusta) →
      </Link>
    </div>
  );
}

/** A listing's sales in one marketplace (from that country's Xray): units and revenue a month, also in euros. */
export type VentasMercado = { pais: CodigoPais; ventas: number | null; facturacion: number; moneda: "EUR" | "GBP"; eur: number };

/** A card's listing: its kit as read (when it was) with today's Xray figures. */
type KitVista = KitCompetidor & { analizado: boolean };

/** One competitor: its place, photo, brand, title, what its kit includes and its figures. */
function Tarjeta({
  k,
  pais,
  puesto,
  conBandera,
  estudioId,
  resenas,
  mercados,
}: {
  k: KitVista;
  pais: CodigoPais;
  puesto: number;
  conBandera: boolean;
  estudioId: string;
  /** Where its full reviews are, if they were uploaded. */
  resenas: ResenasListing | null;
  /** The same listing in every marketplace of the study (each one's Xray), the one that sells most first. */
  mercados: VentasMercado[];
}) {
  const [verResenas, setVerResenas] = useState(false);
  const totalUds = mercados.reduce((s, m) => s + (m.ventas ?? 0), 0);
  const totalEur = mercados.reduce((s, m) => s + m.eur, 0);
  const cambio = k.precio !== null && k.precioXray !== null && Math.abs(k.precio - k.precioXray) >= 0.5;
  return (
    <li className={`flex gap-3 rounded-xl border bg-ink-900/80 p-3 shadow-soft ${k.otroProducto ? "border-warning/30 opacity-70" : "border-white/[0.08]"}`}>
      <div className="flex shrink-0 flex-col items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-accent-500/15 text-xs font-semibold text-accent-300">{puesto}</span>
        <a
          href={enlaceAmazon(pais, k.asin)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex size-24 items-center justify-center overflow-hidden rounded-lg bg-white p-1"
          title="Ver en Amazon"
        >
          {k.imagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pequena(k.imagen)} alt="" loading="lazy" className="size-full object-contain" />
          ) : (
            <span className="text-[10px] text-ink-600">Sin foto</span>
          )}
        </a>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
          {conBandera && <Pais codigo={pais} corto />}
          <span className="font-semibold text-ink-100">{k.marca}</span>
          <a href={enlaceAmazon(pais, k.asin)} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-accent-300 hover:underline">
            {k.asin} ↗
          </a>
          {k.otroProducto && <span className="rounded bg-warning/15 px-1.5 py-px text-[11px] font-medium text-warning">Otro producto: {k.otroProducto}</span>}
        </div>
        <p className="line-clamp-2 text-[13px] leading-snug text-ink-200">{k.titulo}</p>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Qué incluye</span>
          {!k.analizado ? (
            <span className="text-xs text-warning">Pendiente de analizar: pulsa «Analizar pendientes» arriba.</span>
          ) : k.elementos.length ? (
            <div className="flex flex-wrap gap-1.5">
              {k.elementos.map((e, i) => (
                <Elemento key={i} e={e} />
              ))}
            </div>
          ) : (
            <span className="text-xs text-ink-500">La ficha no detalla el contenido.</span>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-x-5 gap-y-1 border-t border-white/[0.05] pt-2">
          <span>
            <span className="tabular text-lg font-bold text-ink-100">
              {k.precio !== null
                ? formatMoneda(k.precio, k.moneda)
                : k.analizado
                  ? "Sin oferta"
                  : k.precioXray !== null
                    ? formatMoneda(k.precioXray, k.moneda)
                    : "—"}
            </span>
            {!k.analizado && k.precioXray !== null && <span className="ml-1.5 text-[11px] text-ink-500">(precio del Xray)</span>}
            {cambio && <span className="ml-1.5 text-[11px] text-ink-500">({formatMoneda(k.precioXray!, k.moneda)} en el Xray)</span>}
            {k.analizado && k.precio === null && k.precioXray !== null && (
              <span className="ml-1.5 text-[11px] text-ink-500">({formatMoneda(k.precioXray, k.moneda)} en el Xray)</span>
            )}
          </span>
          <span className="text-xs text-ink-400">
            <strong className="tabular text-sm text-success">{k.ventasMes !== null ? formatNumero(k.ventasMes) : "—"}</strong> uds/mes en {pais}
          </span>
          <span className="text-xs text-ink-400">
            <strong className="tabular text-ink-200">{formatMoneda(k.facturacion, k.moneda)}</strong> al mes en {pais}
          </span>
          <span className="text-xs text-ink-400">
            {k.valoracion !== null && <strong className="text-accent-300">★ {k.valoracion.toLocaleString("es-ES")}</strong>} {formatNumero(k.resenas)} reseñas
          </span>
          <span className="flex-1" />
          {resenas ? (
            <button
              onClick={() => setVerResenas(!verResenas)}
              aria-expanded={verResenas}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${verResenas ? "border-danger/50 bg-danger/10 text-danger" : "border-white/[0.12] text-ink-200 hover:border-danger/50 hover:text-danger"}`}
            >
              {verResenas ? "Ocultar quejas" : `Leer reseñas (${formatNumero(resenas.total)})`}
            </button>
          ) : (
            <span className="text-[11px] text-ink-600" title="Graba sus reseñas con la extensión o sube su CSV del Review Downloader">
              Sin reseñas cargadas
            </span>
          )}
        </div>
        {mercados.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-white/[0.03] px-2.5 py-2 text-xs">
            <span className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Todos los mercados</span>
            {mercados.map((m) => (
              <span
                key={m.pais}
                className={`inline-flex items-center gap-1.5 ${m.pais === pais ? "text-ink-100" : "text-ink-300"}`}
                title={`Amazon ${m.pais}, según su Xray`}
              >
                <Pais codigo={m.pais} corto />
                <strong className="tabular">{m.ventas !== null ? formatNumero(m.ventas) : "—"}</strong> uds
                <span className="text-ink-500">· {formatMoneda(m.facturacion, m.moneda)}</span>
              </span>
            ))}
            <span
              className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-0.5 text-success"
              title="Suma de todos los países del estudio (libras pasadas a euros)"
            >
              Total: <strong className="tabular">{formatNumero(totalUds)}</strong> uds/mes ·{" "}
              <strong className="tabular">{formatMoneda(totalEur, "EUR")}</strong> al mes
            </span>
          </div>
        )}
        {verResenas && resenas && (
          <div className="rounded-lg border border-danger/20 bg-danger/[0.04] p-3">
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-danger uppercase">De qué se quejan</p>
            <QuejasListing estudioId={estudioId} asin={k.asin} r={resenas} />
          </div>
        )}
      </div>
    </li>
  );
}

const sinCambios = () => () => {};
/** How many leaders «Listings» shows in this browser (the same number is shown here). */
function leerCuantos(clave: string): number {
  try {
    const n = Number(localStorage.getItem(clave));
    return n > TOP_LISTINGS ? n : TOP_LISTINGS;
  } catch {
    return TOP_LISTINGS;
  }
}

/**
 * «Kits competidores»: the same listings «Listings» shows (its view: every country or one, without the ones taken out
 * with ✕, as many as it shows), in the same order (by revenue in euros, the one that earns most first), with their photo, price,
 * sales and what their kit includes. A listing not read yet waits as «pendiente»: «Analizar pendientes» reads only
 * those (what was read is kept), «Volver a analizar» every one of the view.
 */
export function PestanaKits({ estudio, ventasPorAsin }: { estudio: EstudioH10; ventasPorAsin: Record<string, VentasMercado[]> }) {
  const estudioId = estudio.id;
  const kits = estudio.kitsCompetidores ?? null;
  const resenas = estudio.resenasCompletas ?? [];
  const paises = estudio.mercados.map((m) => m.codigoPais);
  /** A listing's full reviews: those of its own country, else the same ASIN's from another one (Amazon shares reviews in Europe). */
  const resenasDe = (pais: CodigoPais, asin: string): ResenasListing | null => {
    const deAsin = resenas.filter((x) => x.asin === asin);
    const propio = deAsin.filter((x) => x.codigoPais === pais);
    const lista = propio.length ? propio : deAsin;
    if (!lista.length) return null;
    // The country with most of them (two files of the same listing count once: the bigger one).
    const mejor = [...lista].sort((a, b) => b.total - a.total)[0];
    return { pais: mejor.codigoPais, total: mejor.total };
  };
  const router = useRouter();
  const [pais, setPais] = useState<CodigoPais | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cuantos = useSyncExternalStore(
    sinCambios,
    () => leerCuantos(claveCuantosListings(estudioId)),
    () => TOP_LISTINGS,
  );

  // «Listings»' leaders of this view, each with its kit when it was read, in its order (by revenue).
  const lista = lideresListings(estudio.mercados, pais, estudio.listingsQuitados ?? [], cuantos)
    .filter((x) => x.c.asin)
    .map(({ m, c }) => {
      const kit = kits?.porPais[m.codigoPais]?.find((k) => k.asin === c.asin);
      const base = {
        ventasMes: c.ventas,
        facturacion: c.facturacion,
        resenas: c.resenas,
        valoracion: c.valoracion ?? null,
        precioXray: c.precio || null,
        moneda: m.moneda,
      };
      const k: KitVista = kit
        ? { ...kit, ...base, analizado: true }
        : {
            asin: c.asin!,
            marca: c.marca,
            titulo: c.titulo,
            imagen: listingDe(estudio.listings, m.codigoPais, c.asin)?.fotos[0] ?? null,
            precio: null,
            elementos: [],
            otroProducto: null,
            ...base,
            analizado: false,
          };
      return { k, pais: m.codigoPais };
    });
  const pendientes = lista.filter((x) => !x.k.analizado);

  const analizar = async (todos: boolean) => {
    const pedir = todos ? lista : pendientes;
    if (!pedir.length) return;
    if (
      !confirm(
        `Se leerán de Amazon ${pedir.length} ${pedir.length === 1 ? "listing" : "listings"} y la IA dirá qué incluye cada kit. Tarda uno o dos minutos y cuesta unos céntimos. ¿Seguir?`,
      )
    )
      return;
    setError(null);
    setAnalizando(true);
    try {
      const r = await fetch(`/api/h10/estudios/${estudioId}/kits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pares: pedir.map((x) => ({ pais: x.pais, asin: x.k.asin })) }),
      });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(b.error ?? `Error ${r.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo analizar");
    } finally {
      setAnalizando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink-100">Kits competidores</h2>
          <p className="mt-0.5 text-xs text-ink-400">
            Los mismos listings de la pestaña «Listings» (los {cuantos} primeros, sin los que quitaste) y en el mismo orden, por facturación, con lo que incluye su kit según
            su ficha de Amazon. Si quitas uno en «Listings», desaparece también aquí.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pendientes.length > 0 && (
            <button
              onClick={() => void analizar(false)}
              disabled={analizando}
              className="rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-60"
            >
              {analizando ? "Analizando… (uno o dos minutos)" : `Analizar pendientes (${pendientes.length})`}
            </button>
          )}
          {lista.length > pendientes.length && (
            <button
              onClick={() => void analizar(true)}
              disabled={analizando}
              className="rounded-lg border border-white/[0.12] px-3.5 py-2 text-sm text-ink-200 hover:bg-white/[0.06] disabled:opacity-60"
            >
              {analizando && !pendientes.length ? "Analizando…" : "Volver a analizar todos"}
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {paises.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {[null, ...paises].map((p) => (
            <button
              key={p ?? "todos"}
              onClick={() => setPais(p)}
              aria-pressed={p === pais}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${p === pais ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
            >
              {p ? <Pais codigo={p} /> : "Todos"}
            </button>
          ))}
        </div>
      )}

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/[0.12] px-4 py-12 text-center text-sm text-ink-400">
          <p className="max-w-md">{paises.length ? "No hay listings en esta vista de «Listings»." : "Sube primero el Xray de algún país en «Datos»."}</p>
        </div>
      ) : (
        <>
          {!pais && <p className="text-xs text-ink-500">Todos los países juntos, ordenados por facturación al mes (en euros), como en «Listings». Cada precio va en la moneda de su país.</p>}
          <ol className="flex flex-col gap-2">
            {lista.map(({ k, pais: p }, i) => (
              <Tarjeta
                key={`${p}|${k.asin}`}
                k={k}
                pais={p}
                puesto={i + 1}
                conBandera={!pais}
                estudioId={estudioId}
                resenas={resenasDe(p, k.asin)}
                mercados={ventasPorAsin[k.asin] ?? []}
              />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
