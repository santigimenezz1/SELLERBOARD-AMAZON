import { diaMadrid, sumarDias } from "./fechas";
import { diasDelMes, fraccionMesTranscurrida, periodoExtra, periodosFijos, type Periodo } from "./periodos";
import { productosDelPeriodo, resumenVentas, serieDiaria, type LineaReembolso, type LineaVenta, type ProductoPeriodo, type PuntoVentas, type ResumenVentas } from "./ventas";

export type ParametrosPanel = { p?: string; e?: string; desde?: string; hasta?: string; pais?: string; mes?: string };

export type EstadoPanel = {
  /** `mes` ("YYYY-MM") is the month of the daily chart; null = the current month. */
  estado: { p: string; e: string | null; desde: string | null; hasta: string | null; pais: string | null; mes: string | null };
  hoy: string;
  periodos: Periodo[];
  seleccionado: Periodo;
};

/** Which tiles to show and which one is selected, from the URL. `paisesValidos` drops unknown market ids. */
export function resolverPanel(params: ParametrosPanel, paisesValidos: string[], ahora = new Date()): EstadoPanel {
  const hoy = diaMadrid(ahora);
  const extra = periodoExtra(params.e, hoy, params.desde, params.hasta);
  const periodos = [...periodosFijos(hoy), ...(extra ? [extra] : [])];
  const seleccionable = periodos.filter((p) => !p.esPronostico);
  const seleccionado = seleccionable.find((p) => p.id === params.p) ?? seleccionable[0];
  const pais = params.pais && paisesValidos.includes(params.pais) ? params.pais : null;
  // Only past months are worth a parameter: the current one is the default.
  const mes = params.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) && params.mes < hoy.slice(0, 7) ? params.mes : null;
  return {
    estado: { p: seleccionado.id, e: extra?.id ?? null, desde: extra?.id === "rango" ? extra.desde : null, hasta: extra?.id === "rango" ? extra.hasta : null, pais, mes },
    hoy,
    periodos,
    seleccionado,
  };
}

/** Month shown in the daily chart ("YYYY-MM"). */
export function mesGrafico({ estado, hoy }: EstadoPanel): string {
  return estado.mes ?? hoy.slice(0, 7);
}

/** The date span covering every tile and the chart (plus the 6 days before it, for the 7-day average), so the page reads Firestore once. */
export function rangoALeer(panel: EstadoPanel): { desde: string; hasta: string } {
  const mes = diasDelMes(mesGrafico(panel));
  const tramos = [...panel.periodos, { desde: sumarDias(mes.desde, -6), hasta: mes.hasta > panel.hoy ? panel.hoy : mes.hasta }];
  return { desde: tramos.reduce((m, p) => (p.desde < m ? p.desde : m), tramos[0].desde), hasta: tramos.reduce((m, p) => (p.hasta > m ? p.hasta : m), tramos[0].hasta) };
}

export function construirPanel(
  lineas: LineaVenta[],
  reembolsos: LineaReembolso[],
  panel: EstadoPanel,
  ahora = new Date(),
): { tarjetas: { periodo: Periodo; resumen: ResumenVentas }[]; productos: ProductoPeriodo[]; serie: PuntoVentas[] } {
  const { periodos, seleccionado, estado, hoy } = panel;
  const mes = periodos.find((p) => p.id === "mes")!;
  const tarjetas = periodos.map((periodo) => {
    if (!periodo.esPronostico) return { periodo, resumen: resumenVentas(lineas, reembolsos, periodo.desde, periodo.hasta, estado.pais) };
    // Month forecast: what's sold so far, scaled to the whole month at the current pace.
    const actual = resumenVentas(lineas, reembolsos, mes.desde, mes.hasta, estado.pais);
    const f = fraccionMesTranscurrida(hoy, ahora);
    return {
      periodo,
      resumen: {
        ventas: Math.round((actual.ventas / f) * 100) / 100,
        unidades: Math.round(actual.unidades / f),
        pedidos: Math.round(actual.pedidos / f),
        reembolsos: Math.round(actual.reembolsos / f),
      },
    };
  });
  const mesSerie = diasDelMes(mesGrafico(panel));
  return {
    tarjetas,
    productos: productosDelPeriodo(lineas, reembolsos, seleccionado.desde, seleccionado.hasta, estado.pais),
    serie: serieDiaria(lineas, mesSerie.desde, mesSerie.hasta, hoy, estado.pais),
  };
}
