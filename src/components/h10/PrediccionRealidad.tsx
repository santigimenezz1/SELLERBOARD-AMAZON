"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LanzamientoPropio } from "@/lib/datos/h10Tipos";
import type { RealidadLanzamiento } from "@/lib/datos/h10Realidad";
import { nombrePais } from "@/lib/datos/h10Analisis";

const PAISES = ["ES", "DE", "FR", "IT", "GB"] as const;

const num = (v: number | null, unidad: string) => (v === null ? "—" : `${v.toLocaleString("es-ES", { maximumFractionDigits: 2 })}${unidad === "uds." ? "" : ` ${unidad}`}`);

/** How far reality is from the forecast: green within 20 %, amber within 50 %, red beyond. */
function desvio(prevision: number | null, real: number | null) {
  if (prevision === null || real === null || prevision === 0) return null;
  const d = (real - prevision) / Math.abs(prevision);
  return { pct: Math.round(d * 100), clase: Math.abs(d) <= 0.2 ? "text-success" : Math.abs(d) <= 0.5 ? "text-warning" : "text-danger" };
}

/**
 * «Previsión frente a realidad»: once the product is launched (its ASIN, country and day), what the report said set
 * against its real sales. Before that, the form to say it's launched.
 */
export function PrediccionRealidad({ estudioId, lanzamiento }: { estudioId: string; lanzamiento: LanzamientoPropio | null }) {
  const router = useRouter();
  const [datos, setDatos] = useState<RealidadLanzamiento | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<LanzamientoPropio>(lanzamiento ?? { asin: "", codigoPais: "ES", desde: new Date().toISOString().slice(0, 10) });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!lanzamiento) return;
    let vivo = true;
    fetch(`/api/h10/estudios/${estudioId}/realidad`)
      .then((r) => r.json())
      .then((j) => vivo && (j.error ? setError(j.error) : setDatos(j.realidad)))
      .catch(() => vivo && setError("No se pudo leer tus ventas"));
    return () => {
      vivo = false;
    };
  }, [estudioId, lanzamiento]);

  const guardar = async (valor: LanzamientoPropio | null) => {
    setGuardando(true);
    setError(null);
    const r = await fetch(`/api/h10/estudios/${estudioId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lanzamiento: valor }) }).catch(() => null);
    const b = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setGuardando(false);
    if (!r?.ok) return setError(b?.error ?? "No se pudo guardar");
    setEditando(false);
    setDatos(null);
    router.refresh();
  };

  const formulario = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void guardar(form);
      }}
      className="mt-3 flex flex-wrap items-end gap-2 text-sm"
    >
      <label className="flex flex-col gap-1 text-xs text-ink-400">
        Tu ASIN
        <input required value={form.asin} onChange={(e) => setForm({ ...form, asin: e.target.value.toUpperCase() })} placeholder="B0…" maxLength={10} className="h-9 w-36 rounded-lg border border-white/[0.08] bg-ink-950/60 px-3 font-mono text-sm text-ink-100 outline-none focus:border-accent-500/60" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-400">
        País
        <select value={form.codigoPais} onChange={(e) => setForm({ ...form, codigoPais: e.target.value as LanzamientoPropio["codigoPais"] })} className="h-9 rounded-lg border border-white/[0.08] bg-ink-950/60 px-2 text-sm text-ink-100">
          {PAISES.map((p) => (
            <option key={p} value={p}>
              {nombrePais(p)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-400">
        Lanzado el
        <input type="date" required value={form.desde} onChange={(e) => setForm({ ...form, desde: e.target.value })} className="h-9 rounded-lg border border-white/[0.08] bg-ink-950/60 px-2 text-sm text-ink-100" />
      </label>
      <button type="submit" disabled={guardando} className="h-9 rounded-lg bg-accent-500 px-3 text-xs font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-60">
        {guardando ? "Guardando…" : "Guardar"}
      </button>
      {lanzamiento && (
        <button type="button" onClick={() => setEditando(false)} className="h-9 rounded-lg px-3 text-xs text-ink-400 hover:text-ink-100">
          Cancelar
        </button>
      )}
    </form>
  );

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-ink-900/80 p-5 shadow-soft">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-ink-100">Previsión frente a realidad</h3>
        {lanzamiento && !editando && (
          <span className="flex gap-1 text-xs">
            <button onClick={() => setEditando(true)} className="rounded-md px-2 py-1 text-ink-300 hover:bg-white/[0.05]">
              Cambiar
            </button>
            <button onClick={() => void guardar(null)} disabled={guardando} className="rounded-md px-2 py-1 text-ink-400 hover:bg-danger/10 hover:text-danger">
              Quitar
            </button>
          </span>
        )}
      </div>
      {!lanzamiento || editando ? (
        <>
          <p className="mt-1 text-sm text-ink-400">¿Ya lo has lanzado? Di tu ASIN, el país y el día, y la app comparará lo que dijo el informe con tus ventas reales, para ver en qué acierta y en qué se equivoca.</p>
          {formulario}
        </>
      ) : !datos ? (
        <p className="mt-2 text-sm text-ink-400">{error ?? "Leyendo tus ventas…"}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-ink-400">
            {datos.lanzamiento.asin} en {nombrePais(datos.lanzamiento.codigoPais)}, desde el {new Date(datos.lanzamiento.desde).toLocaleDateString("es-ES")} ({datos.dias} días): {datos.unidades.toLocaleString("es-ES")} unidades vendidas.
            {datos.informeDe ? ` Previsión del informe del ${new Date(datos.informeDe).toLocaleDateString("es-ES")}.` : " Aún no hay un informe real: las previsiones salen de la hoja de números."}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-400">
                <tr>
                  <th className="py-1.5 pr-4 font-medium">Qué</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Previsión</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Real</th>
                  <th className="py-1.5 pr-4 text-right font-medium">Diferencia</th>
                  <th className="py-1.5 font-medium">De dónde sale la previsión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {datos.filas.map((f) => {
                  const d = desvio(f.prevision, f.real);
                  return (
                    <tr key={f.que}>
                      <td className="py-2 pr-4 text-ink-200">{f.que}</td>
                      <td className="tabular py-2 pr-4 text-right text-ink-300">{num(f.prevision, f.unidad)}</td>
                      <td className="tabular py-2 pr-4 text-right font-medium text-ink-100">{num(f.real, f.unidad)}</td>
                      <td className={`tabular py-2 pr-4 text-right ${d?.clase ?? "text-ink-500"}`}>{d ? `${d.pct > 0 ? "+" : ""}${d.pct} %` : "—"}</td>
                      <td className="py-2 text-xs text-ink-500">{f.fuente}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {datos.meses.length > 0 && (
            <p className="mt-3 text-xs text-ink-400">
              Mes a mes: {datos.meses.map((m) => `${m.mes} ${m.unidades} uds. (${m.ventasEur.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €)`).join(" · ")}
            </p>
          )}
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </>
      )}
    </section>
  );
}
