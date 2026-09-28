"use client";

import { useState } from "react";
import type { LineaGasto } from "@/lib/datos/gastos";
import type { DatosContabilidad, GastoEstimado } from "@/lib/datos/contabilidad";
import { TarjetaResultado } from "./TarjetaResultado";
import { CATEGORIAS, fechaCorta, nombreMes } from "./comun";
import { formatEuros, formatMoneda } from "@/lib/format";
import { Bandera } from "@/components/Bandera";

const suma = (ls: { eur: number }[]) => ls.reduce((s, l) => s + l.eur, 0);

/** The charges of one category joined by day and region (Amazon splits them per marketplace or per fee part). */
function porDiaYRegion(ls: LineaGasto[]) {
  const grupos = new Map<string, { fecha: string | null; region: "eu" | "uk"; importe: number; moneda: string; eur: number }>();
  for (const l of ls) {
    const k = `${l.fecha ?? ""}|${l.region}`;
    const g = grupos.get(k) ?? { fecha: l.fecha, region: l.region, importe: 0, moneda: l.moneda, eur: 0 };
    g.importe += l.importe;
    g.eur += l.eur;
    grupos.set(k, g);
  }
  return [...grupos.values()].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "") || a.region.localeCompare(b.region));
}

/** «Gastos»: month by month, the profit and loss and the charges behind it. */
export function VistaGastos({ contabilidad }: { contabilidad: DatosContabilidad }) {
  const meses = contabilidad.map((m) => m.mes);
  const [mes, setMes] = useState(meses.at(-1) ?? "");
  const datos = contabilidad.find((m) => m.mes === mes);

  if (!datos) {
    return <p className="rounded-xl border border-white/[0.06] bg-ink-900/70 px-4 py-10 text-center text-sm text-ink-400">Aún no hay datos. Se traen en la próxima sincronización.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Month switcher, shared by every card */}
      <div className="flex flex-wrap gap-1.5">
        {meses.map((m) => (
          <button
            key={m}
            onClick={() => setMes(m)}
            aria-pressed={mes === m}
            className={`h-8 rounded-lg border px-3 text-xs capitalize transition-colors ${mes === m ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
          >
            {nombreMes(m)}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TarjetaGastos gastos={datos.gastos} estimados={datos.gastosEstimados} mes={mes} />
        <TarjetaGastosFijos />
      </div>
      <TarjetaResultado datos={datos} />
    </div>
  );
}

// The company's own monthly costs, outside Amazon. Amounts to be filled in; not yet part of the result.
const GASTOS_FIJOS: { nombre: string; color: string; eur: number }[] = [
  { nombre: "Gastos de empresa", color: "#8b7cf6", eur: 0 },
  { nombre: "Vimeo", color: "#3fb68b", eur: 0 },
  { nombre: "Avask", color: "#e0a526", eur: 0 },
  { nombre: "Apple Developer", color: "#6f8fd8", eur: 0 },
];

/** Fixed monthly costs of the company (not Amazon's). */
function TarjetaGastosFijos() {
  const total = suma(GASTOS_FIJOS);
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
      <header className="px-4 py-2.5 text-white" style={{ background: "#2c90b6" }}>
        <h2 className="text-[15px] leading-tight font-semibold">Gastos fijos de la empresa</h2>
      </header>
      <ul className="divide-y divide-white/[0.05]">
        {GASTOS_FIJOS.map((g) => (
          <li key={g.nombre} className="flex items-center gap-3 py-2.5 pr-[38px] pl-4">
            <span aria-hidden className="h-8 w-1 shrink-0 rounded-full" style={{ background: g.color }} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink-100">{g.nombre}</span>
              <span className="block text-[11px] text-ink-400">Pendiente de cargar</span>
            </span>
            <span className="tabular text-sm font-semibold text-danger">{formatEuros(g.eur ? -g.eur : 0)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-center justify-between gap-4 border-t border-white/[0.08] bg-white/[0.03] py-3 pr-[38px] pl-4">
        <p className="text-[11px] leading-snug text-ink-500">Cada mes. Aún no se suman a la cuenta de resultados.</p>
        <p className="shrink-0 text-right">
          <span className="block text-[11px] text-ink-400">Total al mes</span>
          <span className="tabular text-xl font-semibold text-danger">{formatEuros(total ? -total : 0)}</span>
        </p>
      </div>
    </article>
  );
}

/** One row per kind of charge (Europe + UK together), opening to its detail. */
function TarjetaGastos({ gastos, estimados, mes }: { gastos: LineaGasto[]; estimados: GastoEstimado[]; mes: string }) {
  const filas = CATEGORIAS.map((c) => ({ ...c, lineas: gastos.filter((l) => l.categoria === c.id), estimados: estimados.filter((e) => e.categoria === c.id) }))
    .filter((c) => c.lineas.length > 0 || c.estimados.length > 0)
    .map((c) => ({ ...c, total: suma(c.lineas) + suma(c.estimados) }))
    .sort((a, b) => b.total - a.total);
  const total = suma(gastos) + suma(estimados);
  const sinDias = gastos.length > 0 && gastos.every((l) => !l.fecha);

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
      <header className="px-4 py-2.5 text-white" style={{ background: "#2c90b6" }}>
        <h2 className="text-[15px] leading-tight font-semibold">Gastos de {nombreMes(mes, true)}</h2>
      </header>

      {filas.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-400">Sin gastos de cuenta este mes.</p>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {filas.map((c) => {
            const eu = suma(c.lineas.filter((l) => l.region === "eu")) + suma(c.estimados.filter((e) => e.region === "eu"));
            const uk = suma(c.lineas.filter((l) => l.region === "uk")) + suma(c.estimados.filter((e) => e.region === "uk"));
            return (
              <li key={`${mes}-${c.id}`}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] [&::-webkit-details-marker]:hidden">
                    <span aria-hidden className="h-8 w-1 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-100">
                        {c.nombre}
                        {c.estimados.length > 0 && <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-normal text-warning">estimado</span>}
                      </span>
                      <span className="block text-[11px] text-ink-400">
                        {[eu && `Europa ${formatEuros(-eu)}`, uk && `Reino Unido ${formatEuros(-uk)}`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="tabular text-sm font-semibold text-danger">{formatEuros(-c.total)}</span>
                    <span className="text-[10px] text-ink-500 transition-transform group-open:rotate-90">▶</span>
                  </summary>
                  <div className="px-4 pb-3 pl-8">
                    <table className="tabular w-full text-xs">
                      <tbody className="divide-y divide-white/[0.04]">
                        {porDiaYRegion(c.lineas).map((g, i) => (
                          <tr key={i}>
                            <td className="py-1.5 pr-3 text-ink-400">{g.fecha ? `cobrado el ${fechaCorta(g.fecha)}` : "en el mes"}</td>
                            <td className="py-1.5 pr-3 text-ink-300">
                              <span className="inline-flex items-center gap-1.5">
                                {g.region === "uk" ? <Bandera codigo="GB" /> : <span aria-hidden className="fi fi-eu rounded-[2px]" />}
                                {g.region === "uk" ? "Reino Unido" : "Europa"}
                              </span>
                            </td>
                            <td className="py-1.5 text-right text-ink-100">
                              {formatMoneda(-g.importe, g.moneda)}
                              {g.moneda !== "EUR" && <span className="ml-1 text-ink-400">≈ {formatEuros(-g.eur)}</span>}
                            </td>
                          </tr>
                        ))}
                        {c.estimados.map((e, i) => (
                          <tr key={`e${i}`}>
                            <td className="py-1.5 pr-3 text-warning">se cobra el {fechaCorta(e.cobro)}</td>
                            <td className="py-1.5 pr-3 text-ink-300">
                              <span className="inline-flex items-center gap-1.5">
                                {e.region === "uk" ? <Bandera codigo="GB" /> : <span aria-hidden className="fi fi-eu rounded-[2px]" />}
                                {e.region === "uk" ? "Reino Unido" : "Europa"}
                              </span>
                            </td>
                            <td className="py-1.5 text-right text-ink-100">
                              ≈ {formatEuros(-e.eur)} <span className="text-ink-400">(como el mes anterior)</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      {/* Month total, bottom right, under the rows' totals */}
      <div className="mt-auto flex items-center justify-between gap-4 border-t border-white/[0.08] bg-white/[0.03] py-3 pr-[38px] pl-4">
        <p className="text-[11px] leading-snug text-ink-500">
          Cada gasto va en el mes al que corresponde: el almacenamiento cobrado el día 7 es del mes anterior, igual que la factura de publicidad de principios de mes.
          {sinDias ? " De este mes Amazon ya no guarda el detalle por día (solo 90 días)." : ""} Libras pasadas a euros al cambio del día del cobro.
        </p>
        <p className="shrink-0 text-right">
          <span className="block text-[11px] text-ink-400">Total del mes</span>
          <span className="tabular text-xl font-semibold text-danger">{formatEuros(-total)}</span>
        </p>
      </div>
    </article>
  );
}
