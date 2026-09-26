"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/Spinner";

type Resultado = { pedidosNuevos: number; pedidosActualizados: number; transacciones: number; errores: string[] | null; duracionMs: number };

type Estado = { tipo: "idle" } | { tipo: "cargando" } | { tipo: "ok"; r: Resultado } | { tipo: "error"; msg: string };

/** `enCurso`: the server says a sync is already running (started here earlier, or in another tab). */
export function BotonSync({ ultima, enCurso }: { ultima: string | null; enCurso: boolean }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: "idle" });

  // A sync started before this page was (re)opened keeps running on the server: re-render every few
  // seconds until it's done, so its results show up without reloading by hand.
  useEffect(() => {
    if (!enCurso) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [enCurso, router]);

  async function sincronizar() {
    setEstado({ tipo: "cargando" });
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as Partial<Resultado> & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
      setEstado({ tipo: "ok", r: body as Resultado });
      router.refresh();
    } catch (e) {
      setEstado({ tipo: "error", msg: e instanceof Error ? e.message : "Error inesperado" });
    }
  }

  const cargando = estado.tipo === "cargando" || (enCurso && estado.tipo === "idle");

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-3">
        <button
          onClick={sincronizar}
          disabled={cargando}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent-500 px-3.5 text-sm font-medium whitespace-nowrap text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow active:scale-[0.97] disabled:cursor-wait disabled:opacity-70"
        >
          {cargando ? <Spinner tamano="sm" /> : <span aria-hidden>↻</span>}
          {cargando ? "Sincronizando…" : "Sincronizar ahora"}
        </button>
        {ultima && !cargando && <span className="text-xs text-ink-400">Última sincronización: {ultima}</span>}
      </div>
      <div aria-live="polite" className="max-w-md text-sm">
        {cargando && (
          <p className="text-ink-400">La primera vez puede tardar unos minutos. Puedes cambiar de página: los datos aparecerán al terminar.</p>
        )}
        {estado.tipo === "ok" && (
          <div className="rounded-lg border border-white/[0.06] bg-ink-900/80 px-3 py-2">
            <p className={estado.r.errores ? "text-warning" : "text-success"}>
              {estado.r.pedidosNuevos === 1 ? "1 pedido nuevo" : `${estado.r.pedidosNuevos} pedidos nuevos`} · {estado.r.pedidosActualizados} revisados ·{" "}
              {estado.r.transacciones} movimientos financieros
            </p>
            {estado.r.errores && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-left text-xs text-ink-300">
                {estado.r.errores.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {estado.r.errores.length > 5 && <li>…y {estado.r.errores.length - 5} más (detalle en la colección sincronizaciones)</li>}
              </ul>
            )}
          </div>
        )}
        {estado.tipo === "error" && (
          <p role="alert" className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-danger">
            {estado.msg}
          </p>
        )}
      </div>
    </div>
  );
}
