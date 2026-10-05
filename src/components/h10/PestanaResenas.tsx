"use client";

import { useState } from "react";
import type { ResenasEstudio } from "@/lib/datos/h10Tipos";
import { analizarResenas, nombrePais, type TemaContado } from "@/lib/datos/h10Analisis";
import { formatNumero } from "@/lib/format";
import { Barras, Pais, Tarjeta } from "./comun";

const Estrellas = ({ n }: { n: number }) => (
  <span aria-label={`${n} de 5 estrellas`} className="tracking-tight whitespace-nowrap">
    <span className="text-accent-400">{"★".repeat(n)}</span>
    <span className="text-ink-600">{"★".repeat(5 - n)}</span>
  </span>
);

/** Clickable list of themes: picking one filters the sample reviews below. */
function ListaTemas({ temas, elegido, onElegir }: { temas: TemaContado[]; elegido: string | null; onElegir: (id: string | null) => void }) {
  return (
    <Barras
      filas={temas.map((t) => ({
        clave: t.id,
        etiqueta: (
          <button onClick={() => onElegir(elegido === t.id ? null : t.id)} className={`w-full truncate text-left hover:text-ink-100 ${elegido === t.id ? "font-semibold text-accent-300" : ""}`} title={t.texto}>
            {t.texto}
          </button>
        ),
        valor: t.porcentaje,
        texto: `${t.porcentaje} %`,
        detalle: `${t.texto}: ${t.menciones} ${t.menciones === 1 ? "reseña" : "reseñas"} (${t.porcentaje} %) · ${t.marcas.join(", ")}`,
      }))}
      anchoEtiqueta="190px"
    />
  );
}

/** «Reseñas»: what the competitors' customers complain about and praise, and what that means for your product. */
export function PestanaResenas({ datos }: { datos: ResenasEstudio }) {
  const a = analizarResenas(datos);
  const [tema, setTema] = useState<string | null>(null);
  const muestra = datos.competidores
    .flatMap((c) => c.resenas.map((r) => ({ ...r, c })))
    .filter((r) => !tema || r.temas.includes(tema))
    .sort((x, y) => y.fecha.localeCompare(x.fecha));
  const nombreTema = new Map(datos.temas.map((t) => [t.id, t]));

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
        Reseñas <strong>inventadas</strong> para la vista previa. En la versión real se suben las reseñas de los competidores (exportación de Helium 10 o capturas) y la IA las traduce y
        clasifica por temas.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { t: "Reseñas analizadas", v: formatNumero(a.analizadas), s: `de ${datos.competidores.length} competidores` },
          { t: "Valoración media", v: `${a.valoracionMedia.toLocaleString("es-ES")} ★`, s: "de la competencia" },
          { t: "Reseñas negativas", v: `${a.negativas} %`, s: "de 1 y 2 estrellas" },
          { t: "Queja principal", v: a.quejas[0] ? `${a.quejas[0].porcentaje} %` : "—", s: a.quejas[0]?.texto ?? "" },
        ].map((x) => (
          <div key={x.t} className="rounded-xl border border-white/[0.06] bg-ink-900/80 p-4 shadow-soft">
            <p className="text-xs text-ink-400">{x.t}</p>
            <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink-100">{x.v}</p>
            <p className="mt-1 truncate text-xs text-ink-400" title={x.s}>
              {x.s}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="De qué se quejan" subtitulo="% de las reseñas que lo mencionan · toca uno para ver esas reseñas">
          <ListaTemas temas={a.quejas} elegido={tema} onElegir={setTema} />
        </Tarjeta>
        <Tarjeta titulo="Qué valoran" subtitulo="Lo que tu producto también tiene que cumplir">
          <ListaTemas temas={a.elogios} elegido={tema} onElegir={setTema} />
        </Tarjeta>
      </div>

      <Tarjeta titulo="Mejoras para tu producto" subtitulo="Cada queja repetida de la competencia, convertida en algo que tu producto puede hacer mejor">
        <ol className="flex flex-col gap-2.5">
          {a.quejas
            .filter((q) => q.mejora)
            .map((q, i) => (
              <li key={q.id} className="flex gap-3 rounded-lg border border-white/[0.06] bg-ink-950/40 p-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-xs font-semibold text-accent-300">{i + 1}</span>
                <span className="min-w-0 text-sm">
                  <span className="font-medium text-ink-100">{q.mejora}</span>
                  <span className="mt-0.5 block text-xs text-ink-400">
                    Porque el {q.porcentaje} % de las reseñas dice que «{q.texto.toLowerCase()}» ({q.marcas.join(", ")}).
                  </span>
                </span>
              </li>
            ))}
        </ol>
      </Tarjeta>

      <Tarjeta titulo="Competidores según sus clientes">
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="tabular w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-left text-xs text-ink-400">
                <th className="px-2 py-2 font-medium">Marca</th>
                <th className="px-2 py-2 font-medium">País</th>
                <th className="px-2 py-2 text-right font-medium">Valoración</th>
                <th className="px-2 py-2 text-right font-medium">Reseñas</th>
                <th className="px-2 py-2 text-right font-medium">1–2 ★</th>
                <th className="px-2 py-2 font-medium">Queja principal</th>
              </tr>
            </thead>
            <tbody>
              {[...a.porCompetidor]
                .sort((x, y) => y.valoracion - x.valoracion)
                .map((c) => (
                  <tr key={`${c.marca}-${c.codigoPais}`} className="border-b border-white/[0.05]">
                    <td className="px-2 py-2 font-medium text-ink-100" title={c.producto}>
                      {c.marca}
                    </td>
                    <td className="px-2 py-2">
                      <Pais codigo={c.codigoPais} />
                    </td>
                    <td className="px-2 py-2 text-right">{c.valoracion.toLocaleString("es-ES")} ★</td>
                    <td className="px-2 py-2 text-right">{formatNumero(c.totalResenas)}</td>
                    <td className={`px-2 py-2 text-right ${c.negativas >= 15 ? "text-danger" : ""}`}>{c.negativas} %</td>
                    <td className="px-2 py-2 text-ink-300">{c.quejaPrincipal ?? "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta titulo={tema ? `Reseñas sobre «${nombreTema.get(tema)?.texto}»` : "Reseñas de ejemplo"} subtitulo={tema ? undefined : "Traducidas al español. Toca un tema de arriba para filtrarlas."}>
        {tema && (
          <button onClick={() => setTema(null)} className="mb-3 rounded-md px-2 py-1 text-xs text-ink-400 hover:bg-white/[0.06] hover:text-ink-100">
            ✕ Quitar filtro
          </button>
        )}
        <ul className="flex flex-col divide-y divide-white/[0.05]">
          {muestra.map((r, i) => (
            <li key={i} className="flex flex-col gap-1 py-2.5 text-sm">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
                <Estrellas n={r.estrellas} />
                <span className="font-medium text-ink-200">{r.c.marca}</span>
                <span>· {nombrePais(r.c.codigoPais)}</span>
                <span>· {r.fecha.split("-").reverse().join("/")}</span>
              </span>
              <span className="text-ink-200">{r.texto}</span>
              <span className="flex flex-wrap gap-1">
                {r.temas.map((t) => (
                  <span key={t} className={`rounded px-1.5 py-0.5 text-[10px] ${nombreTema.get(t)?.tipo === "queja" ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}>
                    {nombreTema.get(t)?.texto}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Tarjeta>
    </div>
  );
}
