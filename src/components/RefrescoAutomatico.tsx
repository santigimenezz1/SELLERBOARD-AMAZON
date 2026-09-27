"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const CADA_MS = 60_000;

/**
 * Reloads the page's data when a new sync has finished (the automatic one runs every 5 minutes). Checks once
 * a minute while the tab is visible; the endpoint answers from memory, so it costs no Firestore reads.
 */
export function RefrescoAutomatico() {
  const router = useRouter();
  const ultimo = useRef<string | null | undefined>(undefined);
  const mirado = useRef(0);

  useEffect(() => {
    let vivo = true;
    async function mirar() {
      // Focus changes can come in bursts: one look every 10 s is plenty.
      if (document.visibilityState !== "visible" || Date.now() - mirado.current < 10_000) return;
      mirado.current = Date.now();
      const res = await fetch("/api/sync/ultima", { cache: "no-store" }).catch(() => null);
      if (!vivo || !res?.ok) return;
      const { id } = (await res.json()) as { id: string | null };
      if (ultimo.current !== undefined && id !== ultimo.current) router.refresh();
      ultimo.current = id;
    }
    mirar();
    const t = setInterval(mirar, CADA_MS);
    // Coming back to the tab checks straight away.
    document.addEventListener("visibilitychange", mirar);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", mirar);
    };
  }, [router]);

  return null;
}
