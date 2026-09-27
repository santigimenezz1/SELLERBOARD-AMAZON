"use client";

import type { Periodo } from "@/lib/datos/periodos";
import { textoFechas } from "@/lib/datos/periodos";
import type { ResumenVentas } from "@/lib/datos/ventas";
import { formatEuros, formatNumero } from "@/lib/format";
import { useNavegarPanel } from "./Transicion";
import { urlPanel, type EstadoUrl } from "./url";

export type TarjetaPeriodo = { periodo: Periodo; resumen: ResumenVentas };

// Header colours: a blue → green ramp between the app's two series colours, one step per fixed tile.
const CABECERAS: Record<string, string> = {
  hoy: "#3987e5",
  ayer: "#328cce",
  semana: "#2c90b6",
  mes: "#26959f",
  pronostico: "#1f9987",
  mespasado: "#199e70",
};

export function TarjetasPeriodo({ tarjetas, seleccionado, base, estado }: { tarjetas: TarjetaPeriodo[]; seleccionado: string; base: string; estado: EstadoUrl }) {
  const { navegar } = useNavegarPanel();

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
      {tarjetas.map(({ periodo, resumen }) => {
        const activa = periodo.id === seleccionado;
        const extra = periodo.id === estado.e;
        const cuerpo = (
          <>
            <div className="relative px-4 pt-3 pb-2.5 text-white" style={{ background: CABECERAS[periodo.id] ?? "var(--color-ink-700)" }}>
              <p className="pr-6 text-[15px] leading-tight font-semibold">{periodo.nombre}</p>
              <p className="mt-1 text-xs font-medium text-white/85">{textoFechas(periodo)}</p>
            </div>
            <div className="@container flex flex-1 flex-col px-4 pt-3 pb-4">
              <p className="text-xs text-ink-400">Ventas</p>
              <p className="tabular mt-0.5 text-xl font-semibold tracking-tight whitespace-nowrap text-ink-100 sm:text-2xl">{formatEuros(resumen.ventas)}</p>
              {/* Side by side when the tile is wide enough, stacked otherwise. */}
              <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 border-t border-white/[0.06] pt-3 @[192px]:grid-cols-[auto_auto] @[192px]:justify-between">
                <div>
                  <p className="text-xs whitespace-nowrap text-ink-400">Pedidos / Unidades</p>
                  <p className="tabular mt-0.5 text-base text-ink-100">
                    {formatNumero(resumen.pedidos)} / {formatNumero(resumen.unidades)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-400">Reembolsos</p>
                  {/* Like Sellerboard: highlighted only when there are any. */}
                  <p className={`tabular mt-0.5 text-base ${resumen.reembolsos > 0 ? "font-medium text-accent-400" : "text-ink-100"}`}>{formatNumero(resumen.reembolsos)}</p>
                </div>
              </div>
            </div>
            {/* Selected tile: accent bar along the bottom edge. */}
            <span aria-hidden className={`absolute inset-x-0 bottom-0 h-[3px] transition-colors ${activa ? "bg-accent-500" : "bg-transparent"}`} />
          </>
        );

        const marco = `relative flex flex-col overflow-hidden rounded-xl border bg-ink-900/80 text-left shadow-soft transition-colors ${
          activa ? "border-accent-500/50" : "border-white/[0.06]"
        }`;

        return (
          <div key={periodo.id} className="relative">
            {periodo.esPronostico ? (
              <div className={marco} title="Proyección a fin de mes según el ritmo de ventas actual">
                {cuerpo}
              </div>
            ) : (
              <button
                onClick={() => navegar(urlPanel(base, estado, { p: periodo.id }))}
                aria-pressed={activa}
                className={`${marco} h-full w-full cursor-pointer hover:border-white/[0.16]`}
              >
                {cuerpo}
              </button>
            )}
            {extra && (
              <button
                onClick={() => navegar(urlPanel(base, estado, { e: null, desde: null, hasta: null, p: activa ? "hoy" : estado.p }))}
                aria-label={`Quitar ${periodo.nombre}`}
                className="absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded-md text-white/80 hover:bg-white/15 hover:text-white"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
