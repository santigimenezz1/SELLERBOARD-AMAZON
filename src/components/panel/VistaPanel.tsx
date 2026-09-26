import type { ReactNode } from "react";
import type { Marketplace } from "@/lib/datos/tipos";
import type { Periodo } from "@/lib/datos/periodos";
import type { ProductoPeriodo, PuntoVentas } from "@/lib/datos/ventas";
import { ultimosMeses } from "@/lib/datos/periodos";
import { TransicionPanel, Atenuable } from "./Transicion";
import { BarraFiltros } from "./BarraFiltros";
import { TarjetasPeriodo, type TarjetaPeriodo } from "./TarjetasPeriodo";
import { TablaProductosPeriodo } from "./TablaProductosPeriodo";
import { GraficoMes } from "./GraficoMes";
import type { EstadoUrl } from "./url";

type Props = {
  /** Path the dashboard lives at ("/"). */
  base: string;
  estado: EstadoUrl;
  hoy: string;
  tarjetas: TarjetaPeriodo[];
  seleccionado: Periodo;
  /** Daily sales of the chart month. */
  serie: PuntoVentas[];
  productos: ProductoPeriodo[];
  marketplaces: Marketplace[];
  /** Sync button (or its demo stand-in). */
  acciones: ReactNode;
  avisos?: ReactNode;
};

/**
 * Sales dashboard (Sellerboard layout): period tiles on top, the daily chart
 * of a month, and the products of the selected tile below. Phase 1 shows sales and units only; profit, ads and
 * the rest are added later.
 */
export function VistaPanel({ base, estado, hoy, tarjetas, seleccionado, serie, productos, marketplaces, acciones, avisos }: Props) {
  const mercado = marketplaces.find((m) => m.id === estado.pais);
  return (
    <TransicionPanel>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {acciones}
          <BarraFiltros base={base} estado={estado} marketplaces={marketplaces} hoy={hoy} />
        </div>
        {avisos}
        <Atenuable>
          <div className="flex flex-col gap-8">
            <TarjetasPeriodo tarjetas={tarjetas} seleccionado={seleccionado.id} base={base} estado={estado} />
            <GraficoMes
              serie={serie}
              mes={estado.mes ?? hoy.slice(0, 7)}
              meses={ultimosMeses(hoy)}
              diaSeleccionado={seleccionado.desde === seleccionado.hasta ? seleccionado.desde : null}
              base={base}
              estado={estado}
            />
            <TablaProductosPeriodo
              titulo={seleccionado.nombre}
              productos={productos}
              marketplaces={marketplaces}
              dominio={mercado?.dominio.replace(/^https?:\/\//, "") || "www.amazon.es"}
              desglosePorPais={!mercado}
            />
          </div>
        </Atenuable>
      </div>
    </TransicionPanel>
  );
}
