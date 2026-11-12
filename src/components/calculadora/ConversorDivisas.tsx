"use client";

import { useState } from "react";

export type Divisa = "EUR" | "USD" | "GBP";
/** Euros per unit of each currency (the ECB's of the day). */
export type Cambios = Record<Divisa, number>;

const NOMBRES: Record<Divisa, string> = { EUR: "Euros (€)", USD: "Dólares (US$)", GBP: "Libras (£)" };
const SIMBOLO: Record<Divisa, string> = { EUR: "€", USD: "US$", GBP: "£" };
const dinero = (v: number, d: Divisa) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${SIMBOLO[d]}`;
const tasa = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 4 });
/** «1.234,5» or «1234.5» → 1234.5; empty or not a number → null. */
const leer = (s: string) => {
  const t = s.trim();
  if (!t) return null;
  const v = Number(/,/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(v) ? v : null;
};

/**
 * Turns an amount from one currency into another at the ECB rate, both ways (⇄ swaps them). Dollars and euros first;
 * pounds too. `compacto`: one line, for inside the calculator.
 */
export function ConversorDivisas({ cambios, compacto = false }: { cambios: Cambios; compacto?: boolean }) {
  const [cantidad, setCantidad] = useState("100");
  const [de, setDe] = useState<Divisa>("USD");
  const [a, setA] = useState<Divisa>("EUR");
  const v = leer(cantidad);
  const resultado = v === null ? null : (v * cambios[de]) / cambios[a];
  const intercambiar = () => {
    setDe(a);
    setA(de);
    if (resultado !== null) setCantidad(String(Math.round(resultado * 100) / 100).replace(".", ","));
  };
  const selector = (valor: Divisa, cambiar: (d: Divisa) => void, etiqueta: string) => (
    <select
      value={valor}
      onChange={(e) => cambiar(e.target.value as Divisa)}
      aria-label={etiqueta}
      className="h-9 rounded-lg border border-white/[0.12] bg-ink-950/60 px-2 text-sm text-ink-100 outline-none focus:border-accent-400"
    >
      {(Object.keys(NOMBRES) as Divisa[]).map((d) => (
        <option key={d} value={d}>
          {NOMBRES[d]}
        </option>
      ))}
    </select>
  );

  return (
    <div className={compacto ? "flex flex-col gap-2" : "flex flex-col gap-4"}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-ink-400">
          Cantidad
          <input
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value.replace(/[^\d.,-]/g, ""))}
            inputMode="decimal"
            className="tabular h-9 w-32 rounded-lg border border-white/[0.12] bg-ink-950/60 px-3 text-right text-sm text-ink-100 outline-none focus:border-accent-400"
          />
        </label>
        {selector(de, setDe, "De")}
        <button onClick={intercambiar} title="Intercambiar" className="h-9 rounded-lg border border-white/[0.12] px-3 text-sm text-ink-200 hover:bg-white/[0.05]">
          ⇄
        </button>
        {selector(a, setA, "A")}
      </div>
      <div className={compacto ? "text-sm" : "rounded-xl border border-accent-500/30 bg-accent-500/[0.06] p-4"}>
        <p className={`tabular font-semibold text-ink-100 ${compacto ? "" : "text-2xl"}`}>
          {v === null ? "—" : `${dinero(v, de)} = ${dinero(resultado!, a)}`}
        </p>
        <p className="mt-1 text-xs text-ink-500">
          1 {SIMBOLO[de]} = {tasa(cambios[de] / cambios[a])} {SIMBOLO[a]} · 1 {SIMBOLO[a]} = {tasa(cambios[a] / cambios[de])} {SIMBOLO[de]} · cambio oficial del BCE (último publicado)
        </p>
      </div>
      {!compacto && (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="tabular w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-xs text-ink-400">
                <th className="px-2 py-2 text-right font-medium">Dólares</th>
                <th className="px-2 py-2 text-right font-medium">Euros</th>
                <th className="px-2 py-2 text-right font-medium">Euros</th>
                <th className="px-2 py-2 text-right font-medium">Dólares</th>
              </tr>
            </thead>
            <tbody>
              {[1, 5, 10, 50, 100, 500, 1000, 5000].map((x) => (
                <tr key={x} className="border-b border-white/[0.04] text-ink-200">
                  <td className="px-2 py-1.5 text-right">{dinero(x, "USD")}</td>
                  <td className="px-2 py-1.5 text-right text-ink-100">{dinero(x * cambios.USD, "EUR")}</td>
                  <td className="px-2 py-1.5 text-right">{dinero(x, "EUR")}</td>
                  <td className="px-2 py-1.5 text-right text-ink-100">{dinero(x / cambios.USD, "USD")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
