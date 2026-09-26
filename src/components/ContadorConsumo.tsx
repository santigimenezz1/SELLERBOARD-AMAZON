"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Consumo = { lecturas: number; escrituras: number; limiteLecturas: number; limiteEscrituras: number };

const fmt = (n: number) => n.toLocaleString("es-ES", { useGrouping: "always" });

/**
 * TEMPORARY testing aid: today's Firestore reads/writes in the header, refreshed
 * every 5 s and after each navigation, with a brief "+N" when they grow. The
 * endpoint answers from memory, so the polling itself costs nothing.
 */
export function ContadorConsumo() {
  const ruta = usePathname();
  const [c, setC] = useState<Consumo | null>(null);
  const [delta, setDelta] = useState<{ l: number; e: number } | null>(null);
  const previo = useRef<Consumo | null>(null);

  useEffect(() => {
    let vivo = true;
    let borrarDelta: ReturnType<typeof setTimeout> | undefined;
    async function cargar() {
      if (document.visibilityState !== "visible") return;
      const res = await fetch("/api/consumo", { cache: "no-store" }).catch(() => null);
      if (!vivo || !res?.ok) return;
      const nuevo = (await res.json()) as Consumo;
      const p = previo.current;
      if (p && (nuevo.lecturas > p.lecturas || nuevo.escrituras > p.escrituras)) {
        setDelta({ l: nuevo.lecturas - p.lecturas, e: nuevo.escrituras - p.escrituras });
        clearTimeout(borrarDelta);
        borrarDelta = setTimeout(() => setDelta(null), 4000);
      }
      previo.current = nuevo;
      setC(nuevo);
    }
    // Small delay so a navigation's own reads are already counted.
    const primero = setTimeout(cargar, 600);
    const t = setInterval(cargar, 5000);
    return () => {
      vivo = false;
      clearTimeout(primero);
      clearTimeout(borrarDelta);
      clearInterval(t);
    };
  }, [ruta]);

  if (!c) return null;
  const pct = Math.max(c.lecturas / c.limiteLecturas, c.escrituras / c.limiteEscrituras) * 100;
  const color = pct >= 80 ? "text-danger border-danger/30" : pct >= 50 ? "text-warning border-warning/30" : "text-ink-300 border-white/[0.08]";

  return (
    <div
      className={`tabular hidden items-center gap-2 rounded-lg border px-2.5 py-1 text-xs sm:flex ${color}`}
      title={`Firestore hoy: ${fmt(c.lecturas)} de ${fmt(c.limiteLecturas)} lecturas y ${fmt(c.escrituras)} de ${fmt(c.limiteEscrituras)} escrituras gratuitas (se reinicia a las 9:00)`}
    >
      <span>
        <span className="text-ink-400">Lecturas</span> {fmt(c.lecturas)}
      </span>
      <span className="text-ink-600">·</span>
      <span>
        <span className="text-ink-400">Escrituras</span> {fmt(c.escrituras)}
      </span>
      {delta && (
        <span className="font-semibold text-success" aria-live="polite">
          +{fmt(delta.l)}
          {delta.e > 0 && ` / +${fmt(delta.e)}`}
        </span>
      )}
    </div>
  );
}
