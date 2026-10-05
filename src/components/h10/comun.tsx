"use client";

import { Bandera } from "@/components/Bandera";
import { nombrePais } from "@/lib/datos/h10Analisis";
import { formatMoneda } from "@/lib/format";

/* Pieces shared by the «Análisis H10» tabs. */

export const euros = (v: number) => formatMoneda(Math.round(v), "EUR").replace(",00", "");

/** 1–10 score with its meaning in words (never colour alone). */
export function Nota({ valor, invertida = false }: { valor: number; invertida?: boolean }) {
  // Opportunity: high is good. Difficulty (invertida): high is bad.
  const bueno = invertida ? valor <= 4 : valor >= 7;
  const malo = invertida ? valor >= 7 : valor < 4.5;
  const [color, texto] = bueno ? ["bg-success/15 text-success", invertida ? "fácil" : "alta"] : malo ? ["bg-danger/15 text-danger", invertida ? "difícil" : "baja"] : ["bg-warning/15 text-warning", "media"];
  return (
    <span className={`inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap ${color}`}>
      {valor.toLocaleString("es-ES")}
      <span className="font-normal opacity-80">· {texto}</span>
    </span>
  );
}

export function Tarjeta({ id, titulo, subtitulo, children, className = "" }: { id?: string; titulo: string; subtitulo?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`min-w-0 rounded-xl border border-white/[0.06] bg-ink-900/80 p-4 shadow-soft ${className}`}>
      <h2 className="text-sm font-semibold text-ink-100">{titulo}</h2>
      {subtitulo && <p className="mt-0.5 text-xs text-ink-400">{subtitulo}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Horizontal bars, one series: value written next to each bar, details on hover. `anchoEtiqueta`: label column width. */
export function Barras({ filas, anchoEtiqueta = "110px" }: { filas: { clave: string; etiqueta: React.ReactNode; valor: number; texto: string; detalle: string }[]; anchoEtiqueta?: string }) {
  const max = Math.max(...filas.map((f) => f.valor), 1);
  return (
    <ul className="flex flex-col gap-2">
      {filas.map((f) => (
        <li key={f.clave} title={f.detalle} className="grid items-center gap-3 text-xs" style={{ gridTemplateColumns: `${anchoEtiqueta} minmax(0,1fr) auto` }}>
          <span className="truncate text-ink-300">{f.etiqueta}</span>
          <span className="h-5 rounded-r-[4px] bg-white/[0.03]">
            <span className="block h-full rounded-r-[4px] bg-serie-ventas transition-[width]" style={{ width: `${Math.max((f.valor / max) * 100, f.valor > 0 ? 1.5 : 0)}%` }} />
          </span>
          <span className="tabular w-20 text-right font-medium text-ink-100">{f.texto}</span>
        </li>
      ))}
    </ul>
  );
}

export const Pais = ({ codigo, corto = false }: { codigo: string; corto?: boolean }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    <Bandera codigo={codigo} />
    {corto ? codigo : nombrePais(codigo)}
  </span>
);
