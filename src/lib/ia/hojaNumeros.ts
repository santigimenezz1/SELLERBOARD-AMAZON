import "server-only";

import { estudioParaAgente, traerCompetidorAmazon } from "@/lib/datos/estudiosH10";
import { referenciaAmazon, rentabilidadPais, type RentabilidadPais } from "@/lib/datos/h10Rentabilidad";
import { SUPUESTOS_INICIALES, type CodigoPais } from "@/lib/datos/h10Tipos";

/*
 * The team's «hoja de números»: price, costs, Amazon's real FBA fees, profit per unit, break-even ACoS, lowest price
 * and the investment, worked out by code (h10Rentabilidad.ts) so no agent does that arithmetic by hand and every
 * section of the report uses the same figures. All amounts in euros.
 */

const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => Math.round(v * 1000) / 10;

/**
 * Makes sure each country has Amazon's real FBA fees: when no competitor read from Amazon has them yet, asks Amazon
 * (free, read-only) for the ones that sell most, until one answers. Returns the countries it asked for.
 */
export async function asegurarTarifas(estudioId: string): Promise<{ pais: CodigoPais; asin: string | null; ok: boolean }[]> {
  const pedidos: { pais: CodigoPais; asin: string | null; ok: boolean }[] = [];
  const { estudio } = await estudioParaAgente(estudioId);
  const s = estudio.supuestos ?? SUPUESTOS_INICIALES;
  // ASINs Amazon already said aren't sold there: not asked again.
  const noSeVenden = new Set((estudio.amazon ?? []).filter((v) => v.ficha.error?.startsWith("No se vende")).map((v) => `${v.ficha.codigoPais}|${v.ficha.asin}`));
  for (const m of estudio.mercados) {
    if (estudio.calculadoras?.[m.codigoPais] || referenciaAmazon(estudio, m, s)) continue;
    const candidatos = [...m.competidores]
      .filter((c) => c.asin && !noSeVenden.has(`${m.codigoPais}|${c.asin}`))
      .sort((a, b) => b.facturacion - a.facturacion)
      .slice(0, 3);
    let hecho: { asin: string | null; ok: boolean } = { asin: null, ok: false };
    for (const c of candidatos) {
      const ficha = await traerCompetidorAmazon(estudioId, c.asin, m.codigoPais).catch(() => null);
      hecho = { asin: c.asin!, ok: ficha?.tarifaFba != null };
      if (hecho.ok) break;
    }
    pedidos.push({ pais: m.codigoPais, ...hecho });
  }
  return pedidos;
}

function pais(r: RentabilidadPais) {
  const d = r.desglose;
  return {
    pais: r.codigoPais,
    precio: { eur: d.precio, fuente: r.entradas.precio.fuente },
    porUnidad: {
      iva: d.iva,
      comisionAmazon: { eur: d.comision, pct: pct(r.entradas.comisionPct.valor), fuente: r.entradas.comisionPct.fuente },
      tarifaFba: { eur: d.tarifaFba, fuente: r.entradas.tarifaFba.fuente },
      almacenamiento: { eur: d.almacenamiento, fuente: r.entradas.almacenamientoMes.fuente },
      publicidadPorVenta: { eur: d.publicidad, fuente: `${r.entradas.pujaPpc.fuente}, dividida por la conversión` },
      devoluciones: d.devoluciones,
      productoYEnvio: d.producto,
      beneficio: d.beneficio,
    },
    margenPct: pct(r.margen),
    roiPct: pct(r.roi),
    acosEquilibrioPct: pct(r.acosMaximo),
    precioMinimoSinPerder: r.precioMinimo,
    conOtrosPrecios: r.precios.map((p) => ({ precio: p.precio, beneficio: p.beneficio, margenPct: pct(p.margen) })),
    unidadesMercadoMes: r.unidadesMercado,
    escenarios: r.escenarios.map((e) => ({ cuotaPct: pct(e.cuota), unidadesMes: e.unidades, beneficioMes: e.beneficioMes, inversionInicial: e.inversion, mesesParaRecuperar: e.mesesRecuperar })),
    competidorDeReferencia: r.referencia ? { asin: r.referencia.ficha.asin, marca: r.referencia.ficha.marca, motivo: r.referencia.motivo } : null,
  };
}

/** The sheet of every country (or one), optionally at another price in that country (euros). */
export async function hojaNumeros(estudioId: string, opciones: { pais?: string; precio?: number } = {}) {
  const { estudio, palabras, costesPropios } = await estudioParaAgente(estudioId);
  const base = estudio.supuestos ?? SUPUESTOS_INICIALES;
  const elegido = opciones.pais?.toUpperCase();
  const mercados = estudio.mercados.filter((m) => !elegido || m.codigoPais === elegido);
  if (!mercados.length) return { error: `No hay Xray de ${elegido}. Países: ${estudio.mercados.map((m) => m.codigoPais).join(", ")}` };
  const precio = opciones.precio && opciones.precio > 0 ? r2(opciones.precio) : null;
  const filas = mercados
    .map((m) => rentabilidadPais(estudio, m, palabras[m.codigoPais], precio ? { ...base, precios: { ...base.precios, [m.codigoPais]: precio } } : base))
    .sort((a, b) => b.desglose.beneficio - a.desglose.beneficio);
  return {
    nota: "Calculado por código con las tarifas reales de Amazon cuando las hay. Usa estas cifras tal cual: no hagas tus propias cuentas de margen, ACoS o inversión.",
    costes: costesPropios
      ? { fuente: "Los costes del vendedor", fabricaEurUnidad: base.costeFabrica, envioEurUnidad: base.envioUnidad }
      : { fuente: "SUPUESTOS POR DEFECTO: el vendedor aún no ha puesto sus costes. Dilo en el informe", fabricaEurUnidad: base.costeFabrica, envioEurUnidad: base.envioUnidad },
    supuestos: { conversionPpcPct: base.conversion, devolucionesPct: base.devoluciones, mesesEnAlmacen: base.mesesStock, gastoLanzamientoEur: base.lanzamiento },
    ...(precio && { calculadoA: `${precio} € en ${elegido ?? "todos los países"}` }),
    paises: filas.map(pais),
  };
}

/** One line per country for the team's brief: what the sheet says at a glance. */
export async function resumenHoja(estudioId: string): Promise<{ texto: string; completo: string }> {
  const h = await hojaNumeros(estudioId);
  if ("error" in h) return { texto: "", completo: "" };
  const lineas = h.paises.map(
    (p) =>
      `${p.pais}: precio ${p.precio.eur} € (${p.precio.fuente}), tarifa FBA ${p.porUnidad.tarifaFba.eur} € (${p.porUnidad.tarifaFba.fuente}), beneficio ${p.porUnidad.beneficio} €/ud, margen ${p.margenPct} %, ACoS de equilibrio ${p.acosEquilibrioPct} %, precio mínimo ${p.precioMinimoSinPerder} €`,
  );
  return {
    texto: `Hoja de números (calculada por código; detalle con la herramienta «hoja_numeros»; costes: ${h.costes.fuente}):\n${lineas.join("\n")}`,
    completo: JSON.stringify(h),
  };
}
