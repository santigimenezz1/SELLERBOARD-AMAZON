"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CodigoPais, QuejasPorEstrellas } from "@/lib/datos/h10Tipos";
import { formatNumero } from "@/lib/format";

const COLOR: Record<number, { texto: string; barra: string; borde: string }> = {
  1: { texto: "text-danger", barra: "bg-danger", borde: "border-danger/30" },
  2: { texto: "text-danger", barra: "bg-danger/70", borde: "border-danger/20" },
  3: { texto: "text-warning", barra: "bg-warning", borde: "border-warning/30" },
  4: { texto: "text-success", barra: "bg-success/70", borde: "border-success/20" },
  5: { texto: "text-success", barra: "bg-success", borde: "border-success/30" },
};

/**
 * «Qué dicen en cada estrella»: for each star from 1 to 5, the complaints (red) and praise (green) the AI found in the
 * reviews of one competitor, or of every competitor of a country or of every country, with how many reviews say it
 * and one of them as example.
 */
export function QuejasEstrellas({
  estudioId,
  objetivo,
  datos,
  total,
}: {
  estudioId: string;
  /** One competitor, or every competitor of a country («DE»…) or of every country («TODOS»). */
  objetivo: { pais: CodigoPais; asin: string } | { ambito: CodigoPais | "TODOS" };
  datos: QuejasPorEstrellas | null;
  total: number;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analizar = async () => {
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch(`/api/h10/estudios/${estudioId}/estrellas`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(objetivo) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "No se pudo analizar");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo analizar");
    } finally {
      setOcupado(false);
    }
  };
  const boton = (texto: string) => (
    <button onClick={analizar} disabled={ocupado} className="rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-60">
      {ocupado ? "Analizando… (≈ 1 min)" : texto}
    </button>
  );

  if (!datos)
    return (
      <div className="mt-3 flex flex-col items-center gap-3 rounded-lg border border-dashed border-white/[0.12] px-4 py-6 text-center text-sm text-ink-400">
        <p>
          La IA lee {"asin" in objetivo ? "sus" : "las"} {formatNumero(total)} reseñas{"asin" in objetivo ? "" : " de todos estos competidores"} (en su idioma) y te dice, nota por nota de 1 a 5 estrellas, de qué se quejan y qué les gusta, con cuántas reseñas lo dicen.
        </p>
        {boton("Analizar con IA")}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-3">
        {[...datos.grupos].sort((a, b) => a.estrellas - b.estrellas).map((g) => {
          const c = COLOR[g.estrellas];
          return (
            <div key={g.estrellas} className={`flex flex-col gap-3 rounded-xl border ${c.borde} bg-ink-950/40 p-4`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className={`text-lg font-semibold ${c.texto}`}>
                  {g.estrellas} <span className="text-accent-400">{"★".repeat(g.estrellas)}</span>
                </p>
                <p className="text-right text-xs text-ink-400">
                  {formatNumero(g.total)} {g.total === 1 ? "reseña" : "reseñas"}
                  {g.leidas !== undefined && g.leidas < g.total && <span className="block text-[10px] text-ink-500">la IA leyó {formatNumero(g.leidas)}</span>}
                </p>
              </div>
              {g.temas.length === 0 ? (
                <p className="text-sm text-ink-500">{g.total ? "No dicen nada concreto." : "No hay reseñas de esta nota."}</p>
              ) : (
                <ol className="flex flex-col gap-2.5">
                  {g.temas.map((t) => {
                    // Out of the reviews the AI read of that star (all of them when there weren't too many).
                    const base = g.leidas ?? g.total;
                    const pct = base ? Math.round((t.resenas / base) * 100) : 0;
                    // Complaints red, praise green, whatever the star.
                    const elogio = t.tipo === "elogio";
                    return (
                      <li key={t.texto} className="flex flex-col gap-1">
                        <span className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="font-medium text-ink-100">
                            <span aria-hidden className={elogio ? "text-success" : "text-danger"}>
                              {elogio ? "+ " : "− "}
                            </span>
                            {t.texto}
                          </span>
                          <span className="tabular shrink-0 text-xs text-ink-300">
                            <strong className={elogio ? "text-success" : "text-danger"}>{formatNumero(t.resenas)}</strong> · {pct} %
                          </span>
                        </span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                          <span className={`block h-full rounded-full ${elogio ? "bg-success" : "bg-danger"}`} style={{ width: `${Math.max(4, pct)}%` }} />
                        </span>
                        {t.ejemplo && <span className="line-clamp-2 text-[11px] text-ink-500 italic">«{t.ejemplo}»</span>}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
        <span>
          La IA leyó {formatNumero(datos.analizadas)} reseñas el {new Date(datos.generadoEn).toLocaleDateString("es-ES")}. En rojo lo que critican, en verde lo que les gusta; el número es cuántas reseñas de esa
          nota lo dicen (una reseña puede decir varias cosas).
        </span>
        <button onClick={analizar} disabled={ocupado} className="rounded-md px-2 py-1 text-accent-300 hover:bg-white/[0.06] disabled:opacity-60">
          {ocupado ? "Analizando…" : "Volver a analizar"}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
