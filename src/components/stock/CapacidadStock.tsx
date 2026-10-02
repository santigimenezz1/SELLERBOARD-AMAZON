"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Capacidad, RegionCapacidad } from "@/lib/datos/capacidad";
import { Bandera } from "@/components/Bandera";

const m3 = (v: number) => `${v.toLocaleString("es-ES", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} m³`;

/**
 * FBA storage capacity next to «Actualizado»: per region, space used (warehouses + on its way) against the
 * month's limit; green within it, red over it. Clicking a region lets you type its limit (Amazon's Capacity
 * Monitor in Seller Central has it; the API doesn't).
 */
export function CapacidadStock({ capacidad }: { capacidad: Capacidad }) {
  const router = useRouter();
  const [editando, setEditando] = useState<RegionCapacidad | null>(null);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!capacidad.uso) return null;

  const guardar = async (region: RegionCapacidad) => {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/capacidad", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ region, limite: valor.trim() === "" ? null : valor }) });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(b.error ?? `Error ${r.status}`);
      setEditando(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <span className="flex flex-wrap items-center gap-2 border-l border-white/[0.08] pl-3">
      <span className="text-xs text-ink-400">Capacidad del mes</span>
      {(["eu", "uk"] as const).map((r) => {
        const uso = capacidad.uso![r];
        const usado = uso.enAlmacen + uso.enCamino;
        const limite = capacidad.limites[r];
        const color = limite === null ? "border-white/[0.1] text-ink-200" : usado <= limite ? "border-success/40 bg-success/10 text-success" : "border-danger/40 bg-danger/10 text-danger";
        const titulo = `${r === "uk" ? "Reino Unido" : "Europa"}: ${m3(uso.enAlmacen)} en almacén${uso.enCamino ? ` + ${m3(uso.enCamino)} en camino` : ""}${limite !== null ? ` · límite ${m3(limite)}` : " · pulsa para escribir el límite del Monitor de capacidad"}`;
        if (editando === r)
          return (
            <form
              key={r}
              onSubmit={(e) => {
                e.preventDefault();
                void guardar(r);
              }}
              className="flex items-center gap-1.5"
            >
              {r === "uk" ? <Bandera codigo="GB" /> : <span aria-hidden className="fi fi-eu rounded-[2px]" />}
              <input
                autoFocus
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setEditando(null)}
                placeholder="Límite m³"
                aria-label={`Límite de capacidad de ${r === "uk" ? "Reino Unido" : "Europa"} en metros cúbicos`}
                className="tabular h-7 w-24 rounded-md border border-white/[0.15] bg-ink-950/60 px-2 text-xs text-ink-100 outline-none focus:border-accent-500/60"
              />
              <button type="submit" disabled={guardando} className="rounded-md px-1.5 py-0.5 text-xs text-success hover:bg-white/[0.05]">
                ✓
              </button>
              <button type="button" onClick={() => setEditando(null)} className="rounded-md px-1.5 py-0.5 text-xs text-ink-400 hover:bg-white/[0.05]">
                ✕
              </button>
            </form>
          );
        return (
          <button
            key={r}
            onClick={() => {
              setEditando(r);
              setValor(limite !== null ? String(limite).replace(".", ",") : "");
              setError(null);
            }}
            title={titulo}
            className={`tabular inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition-colors hover:brightness-125 ${color}`}
          >
            {r === "uk" ? <Bandera codigo="GB" /> : <span aria-hidden className="fi fi-eu rounded-[2px]" />}
            {m3(usado)}
            <span className="font-normal opacity-80">/ {limite !== null ? m3(limite) : "límite ?"}</span>
          </button>
        );
      })}
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
