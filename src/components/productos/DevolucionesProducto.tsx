"use client";

import { useState } from "react";
import type { DevolucionesProducto as Datos, FilaDevolucion } from "@/lib/datos/devoluciones";
import { formatEuros, formatFechaHora, formatNumero, formatPorcentaje } from "@/lib/format";
import { Bandera } from "@/components/Bandera";

type Mercado = { id: string; pais: string; codigoPais: string };
type Props = { datos: Datos; mercado: Mercado | null; mercados: Mercado[] };

// Amazon's codes in plain Spanish; unknown ones fall back to a readable version of the code.
const MOTIVOS: Record<string, string> = {
  UNWANTED_ITEM: "Ya no lo quiere",
  NO_REASON_GIVEN: "Sin motivo",
  NOT_AS_DESCRIBED: "No es como se describe",
  ORDERED_WRONG_ITEM: "Pidió el artículo equivocado",
  MISORDERED: "Pedido por error",
  DEFECTIVE: "Defectuoso o no funciona",
  QUALITY_UNACCEPTABLE: "Calidad no aceptable",
  MISSING_PARTS: "Faltan piezas",
  DAMAGED_BY_CARRIER: "Dañado en el transporte",
  DAMAGED_BY_FC: "Dañado en el almacén de Amazon",
  UNDELIVERABLE_UNKNOWN: "No se pudo entregar",
  UNDELIVERABLE_REFUSED: "Rechazado en la entrega",
  UNDELIVERABLE_INSUFFICIENT_ADDRESS: "Dirección incompleta",
  NEVER_ARRIVED: "No llegó",
  FOUND_BETTER_PRICE: "Encontró mejor precio",
  EXTRA_ITEM: "Artículo de más",
  SWITCHEROO: "Devolvió otro artículo",
  UNAUTHORIZED_PURCHASE: "Compra no autorizada",
  PART_NOT_COMPATIBLE: "No es compatible",
  APPAREL_TOO_SMALL: "Talla pequeña",
  APPAREL_TOO_LARGE: "Talla grande",
  APPAREL_STYLE: "No le gusta el estilo",
};
const DISPOSICIONES: Record<string, string> = {
  SELLABLE: "Vendible",
  CUSTOMER_DAMAGED: "Dañado por el cliente",
  CARRIER_DAMAGED: "Dañado por el transportista",
  DEFECTIVE: "Defectuoso",
  DAMAGED: "Dañado",
  EXPIRED: "Caducado",
  WAREHOUSE_DAMAGED: "Dañado en el almacén",
};
const ESTADOS: Record<string, string> = {
  "Unit returned to inventory": "Vuelve al inventario",
  Reimbursed: "Amazon te lo reembolsó",
  IMMEDIATE_DONATION: "Donado",
  "Repackaged Successfully": "Reembalado",
  Disposed: "Desechado",
  "Pending Repackaging": "Pendiente de reembalar",
};
const legible = (tabla: Record<string, string>, c: string) => tabla[c] ?? (c ? c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, " ") : "—");

// 0 = everything since the first synced order.
const FILAS_PLEGADA = 4;

const PERIODOS = [
  { dias: 30, nombre: "30 días" },
  { dias: 90, nombre: "90 días" },
  { dias: 0, nombre: "Todo" },
];

function resumen(datos: Datos, mk: string | null, desde: string) {
  const deAqui = (m: string | null) => mk === null || m === mk;
  const dev = datos.devoluciones.filter((d) => d.fecha >= desde && deAqui(d.marketplaceId));
  const reemb = datos.reembolsos.filter((r) => r.fecha >= desde && deAqui(r.marketplaceId));
  const vendidas = datos.ventas.filter((v) => v.dia >= desde.slice(0, 10) && deAqui(v.marketplaceId)).reduce((s, v) => s + v.unidades, 0);
  const devueltas = dev.reduce((s, d) => s + d.unidades, 0);
  const contar = (campo: "motivo" | "disposicion") =>
    Object.entries(dev.reduce<Record<string, number>>((a, d) => ((a[d[campo]] = (a[d[campo]] ?? 0) + d.unidades), a), {})).sort((a, b) => b[1] - a[1]);
  return {
    devueltas,
    vendidas,
    tasa: vendidas > 0 ? (devueltas / vendidas) * 100 : null,
    reembolsos: reemb.length,
    importe: reemb.reduce((s, r) => s + r.importe, 0),
    motivos: contar("motivo"),
    disposiciones: contar("disposicion"),
  };
}

function Barras({ filas, total, tabla, color }: { filas: [string, number][]; total: number; tabla: Record<string, string>; color: string }) {
  if (filas.length === 0) return <p className="text-xs text-ink-600">Sin devoluciones en este periodo.</p>;
  return (
    <ul className="space-y-1.5">
      {filas.map(([c, n]) => (
        <li key={c} className="text-xs">
          <div className="flex justify-between gap-2">
            <span className="truncate text-ink-300">{legible(tabla, c)}</span>
            <span className="tabular shrink-0 text-ink-400">
              {formatNumero(n)} · {formatPorcentaje((n / total) * 100)}
            </span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
            <div className="h-full rounded-full" style={{ width: `${(n / total) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Columna({ titulo, bandera, color, r }: { titulo: string; bandera: string | null; color: string; r: ReturnType<typeof resumen> }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
      <header className="flex items-center gap-2 px-4 py-2.5 text-white" style={{ background: color }}>
        {bandera ? <Bandera codigo={bandera} /> : <span aria-hidden className="fi fi-eu rounded-[2px]" />}
        <p className="text-[15px] leading-tight font-semibold">{titulo}</p>
      </header>
      <div className="grid grid-cols-2 gap-3 border-b border-white/[0.06] px-4 py-3">
        <div>
          <p className="text-xs text-ink-400">Reembolsos</p>
          <p className="tabular text-2xl font-semibold tracking-tight text-ink-100">{formatNumero(r.reembolsos)}</p>
          <p className="tabular text-xs text-ink-400">{formatEuros(r.importe)} devueltos</p>
        </div>
        <div>
          <p className="text-xs text-ink-400">Unidades devueltas</p>
          <p className="tabular text-2xl font-semibold tracking-tight text-ink-100">{formatNumero(r.devueltas)}</p>
          <p className="tabular text-xs text-ink-400">
            {r.tasa === null ? "sin ventas" : `${formatPorcentaje(r.tasa)} de ${formatNumero(r.vendidas)} vendidas`}
          </p>
        </div>
      </div>
      <div className="grid gap-4 px-4 pt-3 pb-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-ink-300">Motivo del cliente</p>
          <Barras filas={r.motivos} total={r.devueltas} tabla={MOTIVOS} color={color} />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-ink-300">Estado de la unidad</p>
          <Barras filas={r.disposiciones} total={r.devueltas} tabla={DISPOSICIONES} color={color} />
        </div>
      </div>
    </article>
  );
}

/** Refunds and physical returns of one product: the selected country next to all marketplaces. */
export function DevolucionesProducto({ datos, mercado, mercados }: Props) {
  const [dias, setDias] = useState(30);
  const [abierta, setAbierta] = useState(false);
  const porId = new Map(mercados.map((m) => [m.id, m]));
  // Never before the first synced order: returns alone, without their sales, would inflate the rate.
  const inicio = datos.inicioDatos ?? new Date(datos.generadoEn - 365 * 86_400_000).toISOString();
  const porPeriodo = dias ? new Date(datos.generadoEn - dias * 86_400_000).toISOString() : inicio;
  const desde = porPeriodo > inicio ? porPeriodo : inicio;
  const pais = mercado ? resumen(datos, mercado.id, desde) : null;
  const todos = resumen(datos, null, desde);
  const enPeriodo: FilaDevolucion[] = datos.devoluciones.filter((d) => d.fecha >= desde);
  // Collapsed to the latest few so the box stays compact.
  const lista = abierta ? enPeriodo : enPeriodo.slice(0, FILAS_PLEGADA);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink-100">Devoluciones y reembolsos</h2>
          <p className="text-xs text-ink-400">
            Reembolsos de tus liquidaciones de Amazon; devoluciones físicas del informe de devoluciones FBA
            {datos.actualizadoEn ? ` (actualizado ${formatFechaHora(new Date(datos.actualizadoEn))})` : " (aún sin descargar: se trae en la próxima sincronización)"}. Desde el{" "}
            {new Date(desde).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" })}. Un reembolso no siempre trae
            devolución física (o llega después).
          </p>
        </div>
        <div role="tablist" aria-label="Periodo" className="inline-flex rounded-lg border border-white/[0.08] p-0.5">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              role="tab"
              aria-selected={dias === p.dias}
              onClick={() => setDias(p.dias)}
              className={`h-7 rounded-md px-2.5 text-xs transition-colors ${dias === p.dias ? "bg-accent-500/15 text-ink-100" : "text-ink-400 hover:text-ink-100"}`}
            >
              {p.nombre}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {mercado && pais && <Columna titulo={mercado.pais} bandera={mercado.codigoPais} color="#328cce" r={pais} />}
        <Columna titulo="Todos los mercados" bandera={null} color="#1f9987" r={todos} />
      </div>

      {lista.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-white/[0.06] bg-ink-900/80">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="px-4 pt-3 pb-1 text-left text-xs font-medium text-ink-300">Últimas devoluciones (todos los mercados)</caption>
            <thead>
              <tr className="text-left text-xs text-ink-400">
                <th className="px-4 py-2 font-normal">Fecha</th>
                <th className="px-2 py-2 font-normal">País</th>
                <th className="px-2 py-2 text-right font-normal">Uds</th>
                <th className="px-2 py-2 font-normal">Motivo</th>
                <th className="px-2 py-2 font-normal">Estado de la unidad</th>
                <th className="px-4 py-2 font-normal">Qué pasó</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((d, i) => {
                const m = d.marketplaceId ? porId.get(d.marketplaceId) : undefined;
                const resaltar = mercado && d.marketplaceId === mercado.id;
                return (
                  <tr key={i} className={`border-t border-white/[0.04] ${resaltar ? "bg-accent-500/[0.06]" : ""}`}>
                    <td className="tabular px-4 py-2 whitespace-nowrap text-ink-300">{new Date(d.fecha).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Madrid" })}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-ink-300">
                      {m ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Bandera codigo={m.codigoPais} />
                          {m.pais}
                        </span>
                      ) : (
                        <span className="text-ink-600" title="Pedido anterior a los datos sincronizados">—</span>
                      )}
                    </td>
                    <td className="tabular px-2 py-2 text-right text-ink-300">{d.unidades}</td>
                    <td className="px-2 py-2 text-ink-100">
                      {legible(MOTIVOS, d.motivo)}
                      {d.comentario && <span className="block text-xs text-ink-400 italic">«{d.comentario}»</span>}
                    </td>
                    <td className="px-2 py-2 text-ink-300">{legible(DISPOSICIONES, d.disposicion)}</td>
                    <td className="px-4 py-2 text-ink-400">{legible(ESTADOS, d.estado)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {enPeriodo.length > FILAS_PLEGADA && (
            <button
              onClick={() => setAbierta((v) => !v)}
              aria-expanded={abierta}
              className="flex w-full items-center justify-center gap-1.5 border-t border-white/[0.06] py-2.5 text-xs text-ink-400 hover:bg-white/[0.03] hover:text-ink-100"
            >
              {abierta ? "Ver menos" : `Ver todas (${enPeriodo.length})`}
              <svg viewBox="0 0 16 16" className={`size-3.5 transition-transform ${abierta ? "rotate-180" : ""}`} aria-hidden>
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
