"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/Spinner";

/** Re-downloads this listing's card and prices from Amazon right away (normally daily / every 3 h). */
export function ActualizarFicha({ asin }: { asin: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<{ tipo: "idle" | "cargando" } | { tipo: "error"; msg: string }>({ tipo: "idle" });

  async function actualizar() {
    setEstado({ tipo: "cargando" });
    try {
      const res = await fetch(`/api/productos/${asin}`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
      setEstado({ tipo: "idle" });
      router.refresh();
    } catch (e) {
      setEstado({ tipo: "error", msg: e instanceof Error ? e.message : "Error" });
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={actualizar}
        disabled={estado.tipo === "cargando"}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 text-sm text-ink-300 hover:border-white/[0.2] hover:text-ink-100 disabled:cursor-wait disabled:opacity-60"
      >
        {estado.tipo === "cargando" ? <Spinner tamano="sm" /> : <span aria-hidden>↻</span>}
        {estado.tipo === "cargando" ? "Consultando…" : "Actualizar ficha"}
      </button>
      {estado.tipo === "error" && <span className="text-xs text-danger">{estado.msg}</span>}
    </span>
  );
}
