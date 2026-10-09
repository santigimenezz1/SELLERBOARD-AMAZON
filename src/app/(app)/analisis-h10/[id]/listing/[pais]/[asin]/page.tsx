import Link from "next/link";
import { notFound } from "next/navigation";
import { estudiosParaVista } from "@/lib/datos/estudiosH10";
import { nombrePais } from "@/lib/datos/h10Analisis";
import { auditarListing, colorNota } from "@/lib/datos/h10Listings";
import { enlaceAmazon } from "@/lib/datos/h10Enlaces";
import { esCodigoPais } from "@/lib/datos/h10Tipos";
import { formatMoneda, formatNumero } from "@/lib/format";
import { Pais, Tarjeta } from "@/components/h10/comun";
import { FotoGenerica } from "@/components/h10/FotoGenerica";

const BORDE_FOTO = { bien: "border-success/60", regular: "border-warning/60", mal: "border-danger/60" };

/** One leader's listing, piece by piece: photos, title, bullets, description, A+, video, price and reviews. */
export default async function ListingH10({ params }: PageProps<"/analisis-h10/[id]/listing/[pais]/[asin]">) {
  const { id, pais, asin } = await params;
  if (!esCodigoPais(pais)) notFound();
  const v = (await estudiosParaVista()).find((x) => x.estudio.id === id);
  const m = v?.estudio.mercados.find((x) => x.codigoPais === pais);
  const c = m?.competidores.find((x) => x.asin === asin);
  if (!v || !m || !c) notFound();
  const a = auditarListing(c, m, v.palabras[pais]);
  const titulo = a.partes.find((p) => p.id === "titulo")!;
  const resto = a.partes.filter((p) => p.id !== "titulo");
  const malos = a.partes.reduce((t, p) => t + p.mal.length, 0);
  const buenos = a.partes.reduce((t, p) => t + p.bien.length, 0);

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/analisis-h10?estudio=${id}&pestana=listings`} className="text-sm text-ink-400 hover:text-ink-100">
        ← {v.estudio.nombre} · Listings
      </Link>

      <p className="w-fit rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
        Simulación · fotos genéricas y hallazgos de ejemplo; el título se analiza de verdad
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <FotoGenerica tono={asin.charCodeAt(5)} className="w-40 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
            <Pais codigo={pais} />
            <span>·</span>
            <span className="font-mono">{asin}</span>
            <span>·</span>
            <a href={enlaceAmazon(pais, asin)} target="_blank" rel="noreferrer" className="text-accent-300 hover:text-accent-400">
              Abrir en Amazon ↗
            </a>
            <span>·</span>
            <Link href={`/analisis-h10/${id}/competidor/${pais}/${asin}`} className="text-accent-300 hover:text-accent-400">
              Ver sus reseñas →
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{c.marca}</h1>
          <p className="mt-1 text-sm text-ink-300">{c.titulo}</p>
          <p className="tabular mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-300">
            <span className="font-semibold text-ink-100">{formatMoneda(c.precio, m.moneda)}</span>
            {c.valoracion ? (
              <span>
                <span className="text-accent-400">★</span> {c.valoracion.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} · {formatNumero(c.resenas)} reseñas
              </span>
            ) : null}
            <span>{formatMoneda(c.facturacion, m.moneda)}/mes</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <span className={`rounded-xl px-4 py-2 text-3xl font-extrabold ${colorNota(a.nota)}`}>
            {a.nota.toLocaleString("es-ES")}
            <span className="text-base font-semibold opacity-70">/10</span>
          </span>
          <span className="flex gap-1.5 text-xs">
            <span className="rounded bg-danger/10 px-2 py-0.5 font-medium text-danger">{malos} fallos</span>
            <span className="rounded bg-success/10 px-2 py-0.5 font-medium text-success">{buenos} aciertos</span>
          </span>
        </div>
      </div>

      {/* Score of each part at a glance */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {a.partes.map((p) => (
          <a key={p.id} href={`#parte-${p.id}`} className="rounded-lg border border-white/[0.06] bg-ink-900/80 px-3 py-2.5 hover:border-white/[0.16]">
            <p className="text-xs text-ink-400">{p.nombre}</p>
            <p className={`mt-1 w-fit rounded px-1.5 text-lg font-bold ${colorNota(p.nota)}`}>{p.nota.toLocaleString("es-ES")}</p>
          </a>
        ))}
      </div>

      <Tarjeta titulo={`Imágenes · ${a.fotos.length} de 9 huecos`} subtitulo="Cada foto con su nota: verde se entiende al instante, amarilla mejorable, roja hueco desaprovechado">
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {a.fotos.map((f) => (
            <div key={f.n} className="flex flex-col gap-1.5">
              <FotoGenerica n={f.n} tipo={f.tipo} tono={f.n} className={`border-2 ${BORDE_FOTO[f.estado]}`} />
              <span className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-ink-300">{f.tipo}</span>
                <span className={`rounded px-1.5 font-bold ${colorNota(f.nota)}`}>{f.nota.toLocaleString("es-ES")}</span>
              </span>
              <span className="text-[11px] leading-snug text-ink-500">{f.comentario}</span>
            </div>
          ))}
          {Array.from({ length: 9 - a.fotos.length }, (_, i) => (
            <div key={`vacio-${i}`} className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-danger/30 text-center text-xs text-danger/80">
              Hueco {a.fotos.length + i + 1}
              <br />
              sin usar
            </div>
          ))}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Análisis de cada foto" subtitulo="Lo que cumple, lo que está bien, lo que falla y lo que le falta mostrar">
        <ol className="mt-3 flex flex-col divide-y divide-white/[0.06]">
          {a.fotos.map((f) => (
            <li key={f.n} className="grid gap-4 py-4 first:pt-1 sm:grid-cols-[120px_1fr]">
              <div className="flex flex-col gap-1.5">
                <FotoGenerica n={f.n} tipo={f.tipo} tono={f.n} className={`border-2 ${BORDE_FOTO[f.estado]}`} />
                <span className={`w-fit rounded px-1.5 text-sm font-bold ${colorNota(f.nota)}`}>{f.nota.toLocaleString("es-ES")}</span>
              </div>
              <div className="flex min-w-0 flex-col gap-2 text-sm">
                <p className="font-semibold text-ink-50">
                  {f.n}. {f.tipo}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {f.checks.map((c) => (
                    <span key={c.texto} className={`rounded-md px-2 py-0.5 text-[11px] ${c.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                      {c.ok ? "✓" : "✕"} {c.texto}
                    </span>
                  ))}
                </div>
                {f.bien.map((t) => (
                  <p key={t} className="text-ink-200">
                    <span className="font-bold text-success">+ </span>
                    {t}
                  </p>
                ))}
                {f.mal.map((t) => (
                  <p key={t} className="text-ink-200">
                    <span className="font-bold text-danger">− </span>
                    {t}
                  </p>
                ))}
                {f.falta && (
                  <p className="border-l-2 border-accent-500 bg-accent-500/[0.07] px-3 py-1.5 text-[13px] text-ink-200">
                    <span className="font-semibold text-accent-300">Le falta mostrar: </span>
                    {f.falta}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Tarjeta>

      <Tarjeta titulo="Lo que ninguna de sus fotos enseña" subtitulo="Cruzado con lo que preguntan y critican sus clientes en las reseñas">
        <ul className="mt-3 flex flex-col gap-2.5">
          {a.fotosQueFaltan.map((x) => (
            <li key={x.texto} className="rounded-lg border border-danger/25 bg-danger/[0.05] px-4 py-2.5 text-sm">
              <span className="font-semibold text-ink-50">✕ {x.texto}</span>
              <span className="mt-0.5 block text-xs text-ink-400">{x.porque}</span>
            </li>
          ))}
        </ul>
      </Tarjeta>

      <Tarjeta titulo="Plan de fotos para tu listing" subtitulo="Qué poner en cada uno de los 9 huecos para superar a este competidor: el guion para el fotógrafo o el diseñador">
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {a.planFotos.map((p) => (
            <div key={p.n} className="flex gap-3 rounded-xl border border-dashed border-accent-500/40 bg-accent-500/[0.04] p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-sm font-extrabold text-accent-300">{p.n}</span>
              <span className="min-w-0 text-sm">
                <span className="block font-semibold text-ink-50">{p.tipo}</span>
                <span className="text-ink-300">{p.mostrar}</span>
              </span>
            </div>
          ))}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Título" subtitulo="Analizado con las palabras clave más buscadas del Cerebro de este país">
        <div className="mt-3 flex flex-col gap-3">
          <p className="rounded-lg border border-white/[0.06] bg-ink-950/50 px-4 py-3 text-[15px] text-ink-100">{c.titulo}</p>
          <p className="text-xs text-ink-400">
            {a.tituloInfo.caracteres} caracteres · en el móvil se ven unos 80 · Amazon permite hasta 200
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <span className={`block h-full rounded-full ${a.tituloInfo.caracteres > 180 ? "bg-danger" : "bg-success"}`} style={{ width: `${Math.min(100, (a.tituloInfo.caracteres / 200) * 100)}%` }} />
            </span>
          </p>
          {(a.tituloInfo.presentes.length > 0 || a.tituloInfo.ausentes.length > 0) && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {a.tituloInfo.presentes.map((k) => (
                <span key={k} className="rounded-md bg-success/10 px-2 py-1 text-success">
                  ✓ {k}
                </span>
              ))}
              {a.tituloInfo.ausentes.map((k) => (
                <span key={k} className="rounded-md bg-danger/10 px-2 py-1 text-danger">
                  ✕ {k}
                </span>
              ))}
            </div>
          )}
          <Hallazgos bien={titulo.bien} mal={titulo.mal} mejora={titulo.mejora} />
        </div>
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-2">
        {resto
          .filter((p) => p.id !== "fotos")
          .map((p) => (
            <section key={p.id} id={`parte-${p.id}`} className="scroll-mt-20 rounded-xl border border-white/[0.06] bg-ink-900/80 p-4 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-ink-100">{p.nombre}</h2>
                <span className={`rounded px-2 py-0.5 text-sm font-bold ${colorNota(p.nota)}`}>{p.nota.toLocaleString("es-ES")}</span>
              </div>
              {p.id === "bullets" && (
                <ul className="mt-3 flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-ink-950/50 px-4 py-3 text-sm text-ink-300">
                  {a.bullets.map((t) => (
                    <li key={t}>• {t}</li>
                  ))}
                </ul>
              )}
              {p.id === "descripcion" && <p className="mt-3 rounded-lg border border-white/[0.06] bg-ink-950/50 px-4 py-3 text-sm text-ink-300">{a.descripcion}</p>}
              <div className="mt-3">
                <Hallazgos bien={p.bien} mal={p.mal} mejora={p.mejora} />
              </div>
            </section>
          ))}
      </div>

      <p className="text-xs text-ink-500">
        En la versión real, el agente de listings leerá la ficha completa de Amazon {nombrePais(pais)} (fotos, A+, vídeo) y la comparará con las reseñas y las palabras clave del estudio.
      </p>
    </div>
  );
}

/** What a part does well (green), what fails (red) and how to beat it. */
function Hallazgos({ bien, mal, mejora }: { bien: string[]; mal: string[]; mejora: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      {bien.map((t) => (
        <p key={t} className="text-ink-200">
          <span className="font-bold text-success">+ </span>
          {t}
        </p>
      ))}
      {mal.map((t) => (
        <p key={t} className="text-ink-200">
          <span className="font-bold text-danger">− </span>
          {t}
        </p>
      ))}
      <p className="mt-1 border-l-2 border-accent-500 bg-accent-500/[0.07] px-3 py-2 text-[13px] text-ink-200">
        <span className="font-semibold text-accent-300">Para superarlo: </span>
        {mejora}
      </p>
    </div>
  );
}
