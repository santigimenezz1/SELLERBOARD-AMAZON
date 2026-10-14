"use client";

import { useEffect } from "react";
import { renovarSesion } from "@/lib/auth/renovarSesion";

/** Renewed at most this often, on opening the app or coming back to its tab. */
const CADA_MS = 6 * 3600_000;
const CLAVE = "sesionRenovadaEn";

/**
 * Keeps the session alive while the app is used: on opening it and on coming back to the tab, at most every 6 hours,
 * the 14-day session starts again. Invisible.
 */
export function RenovarSesion() {
  useEffect(() => {
    const quizas = () => {
      let ultima = 0;
      try {
        ultima = Number(localStorage.getItem(CLAVE) ?? 0);
      } catch {
        /* without storage it renews every time */
      }
      if (Date.now() - ultima < CADA_MS) return;
      void renovarSesion().then((ok) => {
        if (!ok) return;
        try {
          localStorage.setItem(CLAVE, String(Date.now()));
        } catch {
          /* nothing to remember */
        }
      });
    };
    quizas();
    const alVolver = () => {
      if (document.visibilityState === "visible") quizas();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, []);
  return null;
}
