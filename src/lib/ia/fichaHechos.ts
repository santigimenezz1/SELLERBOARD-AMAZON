import type { EstudioH10, PalabrasMercado } from "@/lib/datos/h10Tipos";
import { analizarResenas, cambioAEur, NOMBRES_BLOQUE, notaProducto, rangosDePrecio, resumirEstudio } from "@/lib/datos/h10Analisis";

/*
 * The team's fact sheet: the study's key figures worked out by code, the same for every agent, so each section of the
 * report starts from the same market size, price band, leader and newcomer benchmark instead of each one working them
 * out its own way. Its figures, by concept, are also what the checker holds the report's headline figures to.
 */

/** Below this many reviews a product counts as a newcomer. */
const RESENAS_NUEVO = 100;

const entero = (v: number) => Math.round(v).toLocaleString("es-ES", { useGrouping: "always" });
const dec = (v: number, d = 1) => v.toLocaleString("es-ES", { maximumFractionDigits: d });
const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  return o.length ? (o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2) : null;
};
const percentil = (xs: number[], p: number) => {
  const o = [...xs].sort((a, b) => a - b);
  return o.length ? o[Math.min(o.length - 1, Math.floor(o.length * p))] : null;
};

export type FichaHechos = {
  /** For the agents' brief. */
  texto: string;
  /** The same figures as data (for the checker's reference). */
  datos: Record<string, unknown>;
};

export function fichaHechos(estudio: EstudioH10, palabras: Record<string, PalabrasMercado>): FichaHechos {
  const r = resumirEstudio(estudio);
  const nota = notaProducto(r, analizarResenas(estudio));
  const paises = r.analisis.map((a) => {
    const m = a.mercado;
    const cambio = cambioAEur(m);
    const orden = [...m.competidores].sort((x, y) => y.facturacion - x.facturacion);
    const lider = orden[0];
    const banda = [...rangosDePrecio(m)].sort((x, y) => y.facturacionEur - x.facturacionEur)[0];
    const nuevos = orden.filter((c) => c.resenas < RESENAS_NUEVO);
    const ventasNuevos = nuevos.map((c) => c.ventas).filter((v): v is number => v !== null);
    const factNuevos = nuevos.map((c) => c.facturacion * cambio);
    const t = a.temporada;
    return {
      pais: m.codigoPais,
      palabraClave: m.palabraClave,
      moneda: m.moneda,
      ...(m.moneda === "GBP" && { eurPorLibra: cambio }),
      fechaXray: m.fecha,
      mercadoMediaAnoEurMes: Math.round(a.baseEur),
      mercadoMesXrayEur: Math.round(a.facturacionEur),
      busquedasMes: m.busquedas,
      productosXray: m.competidores.length,
      precioMedioEur: Math.round(a.precioMedioEur * 100) / 100,
      franjaConMasVentas: banda ? { desdeEur: banda.desde, hastaEur: banda.hasta === Infinity ? null : banda.hasta, facturacionEurMes: Math.round(banda.facturacionEur), productos: banda.competidores } : null,
      lider: lider ? { marca: lider.marca, asin: lider.asin, facturacionEurMes: Math.round(lider.facturacion * cambio), ventasMes: lider.ventas, resenas: lider.resenas, precio: lider.precio } : null,
      cuotaTop3Pct: Math.round(a.cuotaTop3 * 1000) / 10,
      marcaLider: a.marcaLider ? { marca: a.marcaLider.marca, cuotaPct: Math.round(a.marcaLider.cuota * 1000) / 10 } : null,
      valoracionLideres: a.valoracionLideres === null ? null : Math.round(a.valoracionLideres * 100) / 100,
      resenasLideres: Math.round(a.resenasLideres),
      nuevos: {
        productos: nuevos.length,
        ventasMesMediana: mediana(ventasNuevos),
        ventasMesP75: percentil(ventasNuevos, 0.75),
        facturacionEurMesMediana: mediana(factNuevos) === null ? null : Math.round(mediana(factNuevos)!),
        facturacionEurMesP75: percentil(factNuevos, 0.75) === null ? null : Math.round(percentil(factNuevos, 0.75)!),
      },
      temporada: t ? { mesFuerte: t.fuerte.mes, mesFlojo: t.flojo.mes, crecimientoAnualPct: t.crecimiento === null ? null : Math.round(t.crecimiento * 1000) / 10, xrayFrenteMediaPct: Math.round(t.xrayFrenteMedia * 100) } : null,
      notaPais: a.oportunidad,
      avisos: a.avisos,
      palabrasCerebro: palabras[m.codigoPais]?.palabras.length ?? 0,
    };
  });

  const lineas = paises.map((p) =>
    [
      `${p.pais} «${p.palabraClave}» (Xray del ${p.fechaXray}${p.moneda === "GBP" ? `, en libras: 1 £ = ${dec(p.eurPorLibra ?? 0, 4)} €` : ""}): mercado ${entero(p.mercadoMediaAnoEurMes)} €/mes${p.temporada ? " de media en el año" : ""} (el mes del Xray, ${entero(p.mercadoMesXrayEur)} €)`,
      p.busquedasMes !== null ? `${entero(p.busquedasMes)} búsquedas/mes` : "búsquedas: sin dato",
      `${p.productosXray} productos`,
      `precio medio ${dec(p.precioMedioEur, 2)} €`,
      p.franjaConMasVentas ? `franja con más ventas ${p.franjaConMasVentas.desdeEur}–${p.franjaConMasVentas.hastaEur ?? "más"} € (${entero(p.franjaConMasVentas.facturacionEurMes)} €/mes, ${p.franjaConMasVentas.productos} productos)` : "",
      p.lider ? `líder ${p.lider.marca} (${p.lider.asin ?? "sin ASIN"}): ${entero(p.lider.facturacionEurMes)} €/mes, ${p.lider.ventasMes ?? "?"} ventas/mes, ${entero(p.lider.resenas)} reseñas, ${dec(p.lider.precio, 2)} ${p.moneda === "GBP" ? "£" : "€"}` : "",
      `los 3 primeros, ${dec(p.cuotaTop3Pct)} %`,
      p.marcaLider ? `marca con más cuota ${p.marcaLider.marca} (${dec(p.marcaLider.cuotaPct)} %)` : "",
      p.valoracionLideres !== null ? `líderes con ${dec(p.valoracionLideres, 2)} ★ y ${entero(p.resenasLideres)} reseñas de media` : "",
      p.nuevos.productos
        ? `productos con menos de ${RESENAS_NUEVO} reseñas: ${p.nuevos.productos}, venden ${p.nuevos.ventasMesMediana ?? "?"} al mes de mediana (percentil 75: ${p.nuevos.ventasMesP75 ?? "?"}) y facturan ${p.nuevos.facturacionEurMesMediana === null ? "?" : entero(p.nuevos.facturacionEurMesMediana)} €/mes de mediana`
        : `ningún producto con menos de ${RESENAS_NUEVO} reseñas`,
      p.temporada ? `temporada: mes fuerte ${p.temporada.mesFuerte}, flojo ${p.temporada.mesFlojo}${p.temporada.crecimientoAnualPct !== null ? `, búsquedas ${p.temporada.crecimientoAnualPct >= 0 ? "+" : ""}${dec(p.temporada.crecimientoAnualPct)} % en un año` : ""}` : "sin historial de búsquedas",
      `nota del país ${dec(p.notaPais)}/10`,
      p.avisos.length ? `AVISOS: ${p.avisos.join(" ")}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  );

  const partes = Object.entries(nota.bloques)
    .map(([k, b]) => `${NOMBRES_BLOQUE[k as keyof typeof NOMBRES_BLOQUE]} ${dec(b.nota)}`)
    .join(" · ");
  const faltan = [
    ...paises.filter((p) => !p.palabrasCerebro).map((p) => `Cerebro de ${p.pais}`),
    ...paises.filter((p) => !p.temporada).map((p) => `historial de búsquedas de ${p.pais}`),
    ...paises.filter((p) => !(estudio.resenasCompletas ?? []).some((x) => x.codigoPais === p.pais)).map((p) => `reseñas completas de ${p.pais}`),
  ];
  const texto = [
    "FICHA DE HECHOS (calculada por código a partir del estudio; es la base común de todo el equipo: usa estas cifras tal cual, en euros, y no las recalcules a tu manera):",
    `Producto: «${estudio.nombre}». País principal: ${r.mejor.mercado.codigoPais} (el que más factura entre los de mejor nota). Mercado total: ${entero(r.mercadoTotalEur)} €/mes. Nota del producto en la app: ${dec(nota.nota)}/10 (${partes}).`,
    ...lineas.map((l) => `- ${l}`),
    faltan.length ? `Datos que no hay en el estudio (no afirmes con seguridad lo que dependa de ellos): ${faltan.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { texto, datos: { paisPrincipal: r.mejor.mercado.codigoPais, mercadoTotalEurMes: Math.round(r.mercadoTotalEur), notaProducto: nota.nota, paises } };
}
