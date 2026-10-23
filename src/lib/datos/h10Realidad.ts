import "server-only";

import { asegurarAlmacen, pedidosEnAlmacen } from "./almacen";
import { idUltimaSync } from "./panel";
import { esVentaAmazon } from "./tipos";
import { estudioParaAgente, mkDe } from "./estudiosH10";
import { hojaNumeros } from "@/lib/ia/hojaNumeros";
import { SUPUESTOS_INICIALES, type LanzamientoPropio } from "./h10Tipos";

/*
 * Forecast against reality: once the owner launches the product of a study, what the report said (sales a month,
 * price, returns, profit per unit) set against the real sales of their ASIN in that country, from the app's own
 * orders. To learn where the reports get it wrong.
 */

const DIA = 86_400_000;
const r2 = (v: number) => Math.round(v * 100) / 100;

export type FilaRealidad = { que: string; prevision: number | null; real: number | null; unidad: string; fuente: string };
export type RealidadLanzamiento = {
  lanzamiento: LanzamientoPropio;
  dias: number;
  unidades: number;
  meses: { mes: string; unidades: number; ventasEur: number }[];
  filas: FilaRealidad[];
  informeDe: string | null;
};

export async function realidadLanzamiento(id: string): Promise<RealidadLanzamiento | null> {
  const { estudio, costesPropios } = await estudioParaAgente(id);
  const l = estudio.lanzamiento;
  if (!l) return null;
  await asegurarAlmacen(await idUltimaSync());
  const mk = mkDe(l.codigoPais);
  const desde = Date.parse(`${l.desde}T00:00:00Z`);
  const lineas = [...pedidosEnAlmacen().values()].filter((p) => p.asin === l.asin && p.marketplaceId === mk && p.estado !== "CANCELLED" && esVentaAmazon(p) && p.fecha.getTime() >= desde);
  const unidades = lineas.reduce((s, p) => s + p.unidades, 0);
  const dias = Math.max(1, Math.floor((Date.now() - desde) / DIA));
  // Sales a month: the last 30 days once a month has gone by, else what there is scaled to 30 days.
  const ultimos = lineas.filter((p) => p.fecha.getTime() >= Date.now() - 30 * DIA).reduce((s, p) => s + p.unidades, 0);
  const ventasMes = dias >= 30 ? ultimos : Math.round((unidades / dias) * 30);
  const ventasEur = lineas.reduce((s, p) => s + p.ventaTotal, 0);
  const conDevolucion = lineas.filter((p) => p.reembolso > 0).reduce((s, p) => s + p.unidades, 0);
  const conCoste = lineas.filter((p) => p.beneficioNeto !== null && p.liquidado);
  const unidadesConCoste = conCoste.reduce((s, p) => s + p.unidades, 0);
  const porMes = new Map<string, { unidades: number; ventasEur: number }>();
  for (const p of lineas) {
    const mes = p.fecha.toISOString().slice(0, 7);
    const m = porMes.get(mes) ?? { unidades: 0, ventasEur: 0 };
    m.unidades += p.unidades;
    m.ventasEur += p.ventaTotal;
    porMes.set(mes, m);
  }

  // What the report said: the market specialist's decisions first, then the others'.
  const informe = estudio.informe;
  const decisiones = (informe?.trabajo?.analisis ?? []).map((a) => ({ quien: a.especialista, d: a.decisiones ?? {} }));
  const primera = <K extends "precioEur" | "ventasMesPrimerAno">(k: K) => decisiones.find((x) => x.d[k] !== undefined);
  const precio = primera("precioEur");
  const ventas = primera("ventasMesPrimerAno");
  const hoja = await hojaNumeros(id, { pais: l.codigoPais, ...(precio?.d.precioEur && { precio: precio.d.precioEur }) }).catch(() => null);
  const filaHoja = hoja && !("error" in hoja) ? hoja.paises[0] : null;
  const supuestos = estudio.supuestos ?? SUPUESTOS_INICIALES;

  const filas: FilaRealidad[] = [
    { que: "Ventas al mes", prevision: ventas?.d.ventasMesPrimerAno ?? null, real: ventasMes, unidad: "uds.", fuente: ventas ? `informe (${ventas.quien})` : "el informe no lo dice" },
    { que: "Precio medio", prevision: precio?.d.precioEur ?? null, real: unidades ? r2(ventasEur / unidades) : null, unidad: "€", fuente: precio ? `informe (${precio.quien})` : "el informe no lo dice" },
    { que: "Devoluciones", prevision: supuestos.devoluciones, real: unidades ? r2((conDevolucion / unidades) * 100) : null, unidad: "%", fuente: "supuesto de la hoja de números" },
    {
      que: "Beneficio por unidad",
      prevision: filaHoja?.porUnidad.beneficio ?? null,
      real: unidadesConCoste ? r2(conCoste.reduce((s, p) => s + (p.beneficioNeto ?? 0), 0) / unidadesConCoste) : null,
      unidad: "€",
      fuente: `hoja de números${costesPropios ? "" : " (con costes supuestos)"}; el real, de los pedidos ya liquidados con coste y sin publicidad`,
    },
  ];
  return {
    lanzamiento: l,
    dias,
    unidades,
    meses: [...porMes].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, m]) => ({ mes, unidades: m.unidades, ventasEur: r2(m.ventasEur) })),
    filas,
    informeDe: informe && !informe.simulado ? informe.generadoEn : null,
  };
}
