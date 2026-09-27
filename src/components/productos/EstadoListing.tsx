"use client";

import { useState } from "react";
import type { SaludProducto } from "@/lib/datos/saludListings";
import { Bandera } from "@/components/Bandera";

// Amazon sometimes answers in English even with issueLocale=es_ES: plain Spanish for the ones seen on this account.
const TRADUCCIONES: Record<string, string> = {
  "100613": "Precio por encima del máximo de Amazon Haul: el listing está suprimido en Amazon Haul (en la tienda normal sigue a la venta).",
};

type Mercado = { id: string; pais: string; codigoPais: string };

/** Top-strip cell: "Listing óptimo" in green, or the problems Amazon reports right now in red. */
export function EstadoListing({ salud, mercado, mercados }: { salud: SaludProducto; mercado: Mercado | null; mercados: Mercado[] }) {
  const [abierto, setAbierto] = useState(false);
  const aqui = mercado ? salud.porMercado[mercado.id] : undefined;
  const otros = mercados.filter((m) => m.id !== mercado?.id && (salud.porMercado[m.id]?.problemas.length ?? 0) > 0);

  return (
    <div>
      <p className="text-xs text-ink-400">Estado del listing {mercado ? `· ${mercado.pais}` : ""}</p>
      {!salud.comprobadoEn ? (
        <p className="mt-0.5 text-sm text-ink-400">Se comprueba en la próxima sincronización</p>
      ) : !aqui ? (
        <p className="mt-0.5 text-sm text-ink-400">No está listado en este país</p>
      ) : aqui.problemas.length === 0 ? (
        aqui.comprable ? (
          <p className="mt-0.5 text-base font-semibold text-success">✓ Listing óptimo</p>
        ) : (
          <p className="mt-0.5 text-base font-semibold text-danger">✗ No se puede comprar ahora</p>
        )
      ) : (
        <>
          <button onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className="mt-0.5 inline-flex items-center gap-1.5 text-base font-semibold text-danger hover:underline">
            ✗ {aqui.problemas.length === 1 ? "1 problema" : `${aqui.problemas.length} problemas`}
            <svg viewBox="0 0 16 16" className={`size-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden>
              <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {abierto && (
            <ul className="mt-1.5 space-y-1.5">
              {aqui.problemas.map((p, i) => (
                <li key={i} className="rounded-md border border-danger/30 bg-danger/[0.07] px-2 py-1.5 text-xs leading-snug text-danger">
                  <span className="font-semibold">{p.suprimido ? "Suprimido" : p.severidad === "ERROR" ? "Error" : "Aviso"}</span>
                  {" · "}
                  {TRADUCCIONES[p.codigo] ?? p.mensaje}
                  <span className="block text-[10px] text-danger/70">SKU {p.sku}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {otros.length > 0 && (
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-danger">
          Problemas también en:
          {otros.map((m) => (
            <a key={m.id} href={`?mk=${m.id}`} title={m.pais} className="inline-flex hover:opacity-80">
              <Bandera codigo={m.codigoPais} />
            </a>
          ))}
        </p>
      )}
    </div>
  );
}
