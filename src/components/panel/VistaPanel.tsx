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
import { Consumo } from "./Consumo";
import { LIMITE_ESCRITURAS, LIMITE_LECTURAS } from "@/lib/datos/consumo";
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
  /** Sync button. */
  acciones: ReactNode;
  /** Today's Firestore reads/writes, against the free-plan limits. */
  consumo: { lecturas: number; escrituras: number };
  avisos?: ReactNode;
};

/**
 * Sales dashboard (Sellerboard layout): period tiles on top, the products of
 * the selected tile below them, and the daily chart of a month at the bottom. Phase 1 shows sales and units only; profit, ads and
 * the rest are added later.
 */
export function VistaPanel({ base, estado, hoy, tarjetas, seleccionado, serie, productos, marketplaces, acciones, avisos, consumo }: Props) {
  const mercado = marketplaces.find((m) => m.id === estado.pais);
  // Near the limit the usage line becomes a warning at the top; otherwise it sits quietly at the bottom.
  const consumoAlto = consumo.lecturas / LIMITE_LECTURAS >= 0.5 || consumo.escrituras / LIMITE_ESCRITURAS >= 0.5;
  return (
    <TransicionPanel>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {acciones}
          <BarraFiltros base={base} estado={estado} marketplaces={marketplaces} hoy={hoy} />
        </div>
        {avisos}
        {consumoAlto && <Consumo {...consumo} />}
        <Atenuable>
          <div className="flex flex-col gap-8">
            <TarjetasPeriodo tarjetas={tarjetas} seleccionado={seleccionado.id} base={base} estado={estado} />
            <TablaProductosPeriodo
              titulo={seleccionado.nombre}
              productos={productos}
              marketplaces={marketplaces}
              dominio={mercado?.dominio.replace(/^https?:\/\//, "") || "www.amazon.es"}
              desglosePorPais={!mercado}
            />
            <GraficoMes
              serie={serie}
              mes={estado.mes ?? hoy.slice(0, 7)}
              meses={ultimosMeses(hoy)}
              diaSeleccionado={seleccionado.desde === seleccionado.hasta ? seleccionado.desde : null}
              base={base}
              estado={estado}
            />
          </div>
        </Atenuable>
        {!consumoAlto && <Consumo {...consumo} />}
      </div>
    </TransicionPanel>
  );
}
