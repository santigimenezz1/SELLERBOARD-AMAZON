"use client";

import { useState } from "react";
import type { Escandallo, RegionCoste } from "@/lib/datos/escandallos";
import { CosteProducto } from "./CosteProducto";

type Datos = { escandallo: Escandallo; precioVenta: number | null; precioOriginal?: string };

const REGIONES: { id: RegionCoste; bandera: string; nombre: string; titulo: string }[] = [
  { id: "eu", bandera: "eu", nombre: "Europa", titulo: "España, Alemania, Francia, Italia, Países Bajos… comparten este coste" },
  { id: "uk", bandera: "gb", nombre: "Reino Unido", titulo: "Coste propio del Reino Unido, aparte del de Europa" },
];

/**
 * The product's cost, one breakdown per region: the EU marketplaces share one, the UK has its own,
 * and editing one never touches the other. Both stay mounted so switching keeps an unsaved edit.
 */
export function CosteRegiones({ inicial, regiones }: { inicial: RegionCoste; regiones: Record<RegionCoste, Datos> }) {
  const [activa, setActiva] = useState<RegionCoste>(inicial);

  const selector = (
    <div role="tablist" aria-label="Región del coste" className="inline-flex rounded-lg border border-white/[0.08] p-0.5">
      {REGIONES.map((r) => (
        <button
          key={r.id}
          role="tab"
          aria-selected={activa === r.id}
          title={r.titulo}
          onClick={() => setActiva(r.id)}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors ${activa === r.id ? "bg-accent-500/15 text-ink-100" : "text-ink-400 hover:text-ink-100"}`}
        >
          <span aria-hidden className={`fi fi-${r.bandera} rounded-[2px]`} />
          {r.nombre}
        </button>
      ))}
    </div>
  );

  return (
    <>
      {REGIONES.map((r) => (
        <div key={r.id} hidden={activa !== r.id}>
          <CosteProducto
            inicial={regiones[r.id].escandallo}
            precioVenta={regiones[r.id].precioVenta}
            precioOriginal={regiones[r.id].precioOriginal}
            selector={selector}
          />
        </div>
      ))}
    </>
  );
}
