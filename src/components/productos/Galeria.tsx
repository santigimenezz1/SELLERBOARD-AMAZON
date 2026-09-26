"use client";

import { useState } from "react";

/** Compact gallery: the hovered/clicked image large, the thumbnails in a row underneath. */
export function Galeria({ imagenes, titulo }: { imagenes: string[]; titulo: string }) {
  const [activa, setActiva] = useState(0);
  if (imagenes.length === 0) {
    return <div className="flex aspect-square items-center justify-center rounded-lg bg-[#F7F8F8] text-sm text-[#565959]">Sin imágenes</div>;
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* min-w-0 + an absolutely filled image: the photo scales to the column instead of pushing it wider. */}
      <div className="relative aspect-square w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imagenes[activa]} alt={titulo} className="absolute inset-0 size-full object-contain" />
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Miniaturas">
        {imagenes.map((src, i) => (
          <li key={src}>
            <button
              onMouseEnter={() => setActiva(i)}
              onFocus={() => setActiva(i)}
              onClick={() => setActiva(i)}
              aria-label={`Imagen ${i + 1}`}
              aria-current={i === activa}
              className={`flex size-10 items-center justify-center overflow-hidden rounded-md border bg-white p-0.5 ${i === activa ? "border-[#007185] shadow-[0_0_3px_2px_rgba(228,121,17,0.5)]" : "border-[#D5D9D9] hover:border-[#007185]"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="size-full object-contain" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
