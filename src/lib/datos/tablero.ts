import { diaMadrid } from "./fechas";
import { fraccionMesTranscurrida, periodoExtra, periodosFijos, type Periodo } from "./periodos";
import { productosDelPeriodo, resumenVentas, type LineaReembolso, type LineaVenta, type ProductoPeriodo, type ResumenVentas } from "./ventas";

export type ParametrosPanel = { p?: string; e?: string; desde?: string; hasta?: string; pais?: string };

export type EstadoPanel = {
  estado: { p: string; e: string | null; desde: string | null; hasta: string | null; pais: string | null };
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
  return {
    estado: { p: seleccionado.id, e: extra?.id ?? null, desde: extra?.id === "rango" ? extra.desde : null, hasta: extra?.id === "rango" ? extra.hasta : null, pais },
    hoy,
    periodos,
    seleccionado,
  };
}

/** The date span that covers every tile, so the page reads Firestore once. */
export function rangoALeer(periodos: Periodo[]): { desde: string; hasta: string } {
  return { desde: periodos.reduce((m, p) => (p.desde < m ? p.desde : m), periodos[0].desde), hasta: periodos.reduce((m, p) => (p.hasta > m ? p.hasta : m), periodos[0].hasta) };
}

export function construirPanel(
  lineas: LineaVenta[],
  reembolsos: LineaReembolso[],
  { periodos, seleccionado, estado, hoy }: EstadoPanel,
  ahora = new Date(),
): { tarjetas: { periodo: Periodo; resumen: ResumenVentas }[]; productos: ProductoPeriodo[] } {
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
  return { tarjetas, productos: productosDelPeriodo(lineas, seleccionado.desde, seleccionado.hasta, estado.pais) };
}
