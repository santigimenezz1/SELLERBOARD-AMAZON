"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SkuConCoste } from "@/lib/datos/costes";
import { formatNumero } from "@/lib/format";
import { Spinner } from "@/components/Spinner";

export function EditorCostes({ skus, sinCoste }: { skus: SkuConCoste[]; sinCoste: number }) {
  const [filtro, setFiltro] = useState("");
  const q = filtro.trim().toLowerCase();
  const visibles = q ? skus.filter((s) => `${s.sku} ${s.titulo} ${s.asin}`.toLowerCase().includes(q)) : skus;

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-ink-900/70">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <p className="text-sm text-ink-300">
          {formatNumero(skus.length)} SKUs
          {sinCoste > 0 && <span className="text-warning"> · {sinCoste} sin coste</span>}
        </p>
        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar SKU, título o ASIN"
          aria-label="Buscar"
          className="h-9 w-full max-w-xs rounded-lg border border-white/[0.08] bg-ink-950/60 px-3 text-sm text-ink-100 outline-none placeholder:text-ink-600 hover:border-white/[0.14] focus:border-accent-500/70"
        />
      </div>
      <ul className="mt-3 divide-y divide-white/[0.04]">
        {visibles.map((s) => (
          <FilaCoste key={s.sku} s={s} />
        ))}
      </ul>
    </section>
  );
}

function FilaCoste({ s }: { s: SkuConCoste }) {
  const router = useRouter();
  const inicial = s.costeUnitario === null ? "" : s.costeUnitario.toFixed(2).replace(".", ",");
  const [valor, setValor] = useState(inicial);
  const [estado, setEstado] = useState<{ tipo: "idle" | "guardando" } | { tipo: "ok"; msg: string } | { tipo: "error"; msg: string }>({ tipo: "idle" });

  const numero = Number(valor.replace(",", "."));
  const valido = valor.trim() !== "" && Number.isFinite(numero) && numero >= 0;
  const cambiado = valor !== inicial;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setEstado({ tipo: "guardando" });
    try {
      const res = await fetch("/api/costes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: s.sku, costeUnitario: numero }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; pedidosCompletados?: number };
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
      const n = body.pedidosCompletados ?? 0;
      setEstado({ tipo: "ok", msg: n > 0 ? `Guardado · aplicado a ${n} ${n === 1 ? "pedido" : "pedidos"} sin coste` : "Guardado" });
      router.refresh();
    } catch (err) {
      setEstado({ tipo: "error", msg: err instanceof Error ? err.message : "Error" });
    }
  }

  const id = `coste-${s.sku}`;

  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 ${s.costeUnitario === null ? "bg-warning/[0.04]" : ""}`}>
      <div className="min-w-0 flex-1 basis-64">
        <label htmlFor={id} className="block truncate text-sm text-ink-100" title={s.titulo}>
          {s.titulo || s.sku}
        </label>
        <p className="truncate font-mono text-[11px] text-ink-400">
          {s.sku}
          {s.asin && ` · ${s.asin}`} · {formatNumero(s.unidades)} uds vendidas
        </p>
      </div>
      <form onSubmit={guardar} className="flex items-center gap-2">
        <div className="relative">
          <input
            id={id}
            inputMode="decimal"
            value={valor}
            onChange={(e) => {
              setValor(e.target.value);
              setEstado({ tipo: "idle" });
            }}
            placeholder="0,00"
            aria-invalid={valor !== "" && !valido}
            className="tabular h-9 w-28 rounded-lg border border-white/[0.08] bg-ink-950/60 pr-7 pl-3 text-right text-sm text-ink-100 outline-none placeholder:text-ink-600 hover:border-white/[0.14] focus:border-accent-500/70 aria-[invalid=true]:border-danger/60"
          />
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-ink-400">€</span>
        </div>
        <button
          type="submit"
          disabled={!valido || !cambiado || estado.tipo === "guardando"}
          className="inline-flex h-9 w-24 items-center justify-center rounded-lg bg-white/[0.08] text-sm text-ink-100 transition-colors hover:bg-white/[0.12] disabled:opacity-40"
        >
          {estado.tipo === "guardando" ? <Spinner tamano="sm" etiqueta="Guardando" /> : "Guardar"}
        </button>
      </form>
      <p aria-live="polite" className="w-full text-right text-xs sm:w-56">
        {s.costeUnitario === null && estado.tipo === "idle" && <span className="text-warning">⚠ Falta coste de producto</span>}
        {estado.tipo === "ok" && <span className="text-success">{estado.msg}</span>}
        {estado.tipo === "error" && <span className="text-danger">{estado.msg}</span>}
      </p>
    </li>
  );
}
