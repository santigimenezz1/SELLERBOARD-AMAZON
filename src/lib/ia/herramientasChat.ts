import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { datosVentas, pedidosEnAlmacen } from "@/lib/datos/almacen";
import { cargarMarketplaces, idUltimaSync } from "@/lib/datos/panel";
import { productosDelPeriodo, resumenVentas } from "@/lib/datos/ventas";
import { diaMadrid } from "@/lib/datos/fechas";
import { obtenerStock } from "@/lib/datos/stock";
import { obtenerGastos } from "@/lib/datos/gastos";
import { CATEGORIAS } from "@/components/gastos/comun";
import { datosVine, inscripcionesVine } from "@/lib/datos/vine";
import { todasLasDevoluciones } from "@/lib/datos/devoluciones";
import { CATEGORIAS_POLITICAS, obtenerEstadoCuenta } from "@/lib/datos/estadoCuenta";
import { listarTickets } from "@/lib/datos/tickets";
import type { Marketplace } from "@/lib/datos/tipos";

/*
 * The read-only tools the chat's AI can call to answer questions about the shop. Each one wraps the same
 * functions the pages use, so the chat's figures match what the app shows. None of them change anything.
 */

type Entrada = Record<string, unknown>;
type Herramienta = {
  definicion: Anthropic.Beta.BetaTool;
  /** Short Spanish label shown to the user while it runs («Ventas por producto»). */
  etiqueta: string;
  ejecutar: (e: Entrada, ctx: Contexto) => Promise<unknown>;
};
type Contexto = { marketplaces: Marketplace[] };

const redondear = (v: number) => Math.round(v * 100) / 100;
const MAX_FILAS = 60;

// ---------- Inputs ----------

class ErrorEntrada extends Error {}

const esDia = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const esMes = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}$/.test(v);

function rango(e: Entrada): { desde: string; hasta: string } {
  if (!esDia(e.desde) || !esDia(e.hasta)) throw new ErrorEntrada("desde y hasta deben ser fechas YYYY-MM-DD");
  return e.desde <= e.hasta ? { desde: e.desde, hasta: e.hasta } : { desde: e.hasta, hasta: e.desde };
}

/** Country code ("ES", "GB"; "UK" also works) → marketplace id; null = every country. */
function marketplaceDe(e: Entrada, ctx: Contexto): string | null {
  if (e.pais === undefined || e.pais === null || e.pais === "") return null;
  if (typeof e.pais !== "string") throw new ErrorEntrada("pais debe ser un código de país");
  const codigo = e.pais.trim().toUpperCase() === "UK" ? "GB" : e.pais.trim().toUpperCase();
  const mk = ctx.marketplaces.find((m) => m.codigoPais.toUpperCase() === codigo || m.id === e.pais);
  if (!mk) throw new ErrorEntrada(`No hay marketplace con código ${e.pais}. Códigos válidos: ${ctx.marketplaces.map((m) => m.codigoPais).join(", ")}`);
  return mk.id;
}

const PROPIEDADES_PERIODO = {
  desde: { type: "string", description: "Primer día incluido, YYYY-MM-DD (hora de Madrid)" },
  hasta: { type: "string", description: "Último día incluido, YYYY-MM-DD" },
  pais: { type: "string", description: "Código del país del marketplace (ES, DE, FR, IT, GB…). Omítelo para todos los países." },
} as const;

async function lineasYReembolsos() {
  return datosVentas(await idUltimaSync());
}

// ---------- Tools ----------

const HERRAMIENTAS: Record<string, Herramienta> = {
  resumen_ventas: {
    etiqueta: "Resumen de ventas",
    definicion: {
      name: "resumen_ventas",
      description:
        "Totales de ventas de un periodo: importe vendido (EUR), unidades, pedidos y pedidos reembolsados, más el desglose por país. Úsala para «cuánto vendimos», «en qué país se vendió más», comparaciones entre periodos (llámala una vez por periodo).",
      input_schema: { type: "object", properties: PROPIEDADES_PERIODO, required: ["desde", "hasta"], additionalProperties: false },
    },
    async ejecutar(e, ctx) {
      const { desde, hasta } = rango(e);
      const mk = marketplaceDe(e, ctx);
      const { lineas, reembolsos } = await lineasYReembolsos();
      const total = resumenVentas(lineas, reembolsos, desde, hasta, mk);
      const conVentas = new Set(lineas.map((l) => l.marketplaceId));
      const porPais = ctx.marketplaces
        .filter((m) => conVentas.has(m.id) && (!mk || m.id === mk))
        .map((m) => ({ pais: m.pais, codigo: m.codigoPais, ...resumenVentas(lineas, reembolsos, desde, hasta, m.id) }))
        .filter((p) => p.unidades > 0 || p.reembolsos > 0)
        .sort((a, b) => b.unidades - a.unidades);
      return { periodo: { desde, hasta }, total, porPais };
    },
  },

  ventas_por_producto: {
    etiqueta: "Ventas por producto",
    definicion: {
      name: "ventas_por_producto",
      description:
        "Cada producto (SKU) vendido en el periodo: unidades, importe (EUR), pedidos reembolsados, precio medio por unidad (EUR) y unidades por país. Ordenado por unidades. Úsala para «cuántas unidades de cada producto», «qué listing funcionó mejor».",
      input_schema: { type: "object", properties: PROPIEDADES_PERIODO, required: ["desde", "hasta"], additionalProperties: false },
    },
    async ejecutar(e, ctx) {
      const { desde, hasta } = rango(e);
      const mk = marketplaceDe(e, ctx);
      const { lineas, reembolsos } = await lineasYReembolsos();
      const codigo = new Map(ctx.marketplaces.map((m) => [m.id, m.codigoPais]));
      const productos = productosDelPeriodo(lineas, reembolsos, desde, hasta, mk).map((p) => ({
        sku: p.sku,
        asin: p.asin,
        titulo: p.titulo.slice(0, 90),
        unidades: p.unidades,
        ventasEUR: p.ventas,
        pedidosReembolsados: p.reembolsos,
        precioMedioEUR: p.precioMedio,
        unidadesPorPais: Object.fromEntries(p.porMarketplace.map((x) => [codigo.get(x.marketplaceId) ?? x.marketplaceId, x.unidades])),
      }));
      return { periodo: { desde, hasta }, productos: productos.slice(0, MAX_FILAS), ...(productos.length > MAX_FILAS && { aviso: `Solo los ${MAX_FILAS} primeros de ${productos.length}` }) };
    },
  },

  ventas_por_precio: {
    etiqueta: "Ventas por precio",
    definicion: {
      name: "ventas_por_precio",
      description:
        "Unidades vendidas a cada precio por unidad, en la moneda del marketplace (lo que pagó el cliente, IVA incluido), por país y producto. Úsala para «a qué precio se vendieron más unidades». Puedes filtrar por un SKU.",
      input_schema: {
        type: "object",
        properties: { ...PROPIEDADES_PERIODO, sku: { type: "string", description: "Solo este SKU (opcional)" } },
        required: ["desde", "hasta"],
        additionalProperties: false,
      },
    },
    async ejecutar(e, ctx) {
      const { desde, hasta } = rango(e);
      const mk = marketplaceDe(e, ctx);
      const sku = typeof e.sku === "string" && e.sku ? e.sku : null;
      await lineasYReembolsos();
      const codigo = new Map(ctx.marketplaces.map((m) => [m.id, m.codigoPais]));
      const grupos = new Map<string, { pais: string; sku: string; moneda: string; precio: number; unidades: number; pedidos: Set<string> }>();
      const sinPrecio = new Map<string, number>();
      for (const p of pedidosEnAlmacen().values()) {
        if (p.estado === "CANCELLED" || p.unidades <= 0 || (mk && p.marketplaceId !== mk) || (sku && p.sku !== sku)) continue;
        const dia = diaMadrid(p.fecha);
        if (dia < desde || dia > hasta) continue;
        const pais = codigo.get(p.marketplaceId) ?? p.marketplaceId;
        // Back to the marketplace's own currency: ventaTotal was converted to EUR at the order day's rate.
        const precio = redondear(p.ventaTotal / (p.tipoCambio || 1) / p.unidades);
        // Pending orders have no amount yet: counted apart so the units still add up.
        if (precio <= 0) {
          sinPrecio.set(`${pais}|${p.sku}`, (sinPrecio.get(`${pais}|${p.sku}`) ?? 0) + p.unidades);
          continue;
        }
        const clave = `${pais}|${p.sku}|${precio}`;
        const gr = grupos.get(clave) ?? { pais, sku: p.sku, moneda: p.moneda, precio, unidades: 0, pedidos: new Set() };
        gr.unidades += p.unidades;
        gr.pedidos.add(p.amazonOrderId);
        grupos.set(clave, gr);
      }
      const filas = [...grupos.values()].map(({ pedidos, ...g }) => ({ ...g, pedidos: pedidos.size })).sort((a, b) => b.unidades - a.unidades);
      return {
        periodo: { desde, hasta },
        precios: filas.slice(0, MAX_FILAS),
        ...(filas.length > MAX_FILAS && { aviso: `Solo los ${MAX_FILAS} primeros de ${filas.length}` }),
        ...(sinPrecio.size > 0 && {
          unidadesSinPrecioAun: [...sinPrecio].map(([clave, unidades]) => ({ pais: clave.split("|")[0], sku: clave.split("|")[1], unidades })),
          notaSinPrecio: "Pedidos pendientes: Amazon aún no ha informado su importe. Cuentan en las unidades vendidas pero no tienen precio.",
        }),
      };
    },
  },

  ventas_por_dia: {
    etiqueta: "Ventas por día",
    definicion: {
      name: "ventas_por_dia",
      description: "Importe (EUR), unidades y pedidos de cada día del periodo. Úsala para «qué día se vendió más», evolución o tendencia dentro de un periodo.",
      input_schema: { type: "object", properties: PROPIEDADES_PERIODO, required: ["desde", "hasta"], additionalProperties: false },
    },
    async ejecutar(e, ctx) {
      const { desde, hasta } = rango(e);
      const mk = marketplaceDe(e, ctx);
      const { lineas } = await lineasYReembolsos();
      const dias = new Map<string, { ventasEUR: number; unidades: number; pedidos: Set<string> }>();
      for (const l of lineas) {
        if (l.estado === "CANCELLED" || (mk && l.marketplaceId !== mk)) continue;
        const dia = diaMadrid(l.fecha);
        if (dia < desde || dia > hasta) continue;
        const d = dias.get(dia) ?? { ventasEUR: 0, unidades: 0, pedidos: new Set() };
        d.ventasEUR += l.ventaTotal;
        d.unidades += l.unidades;
        d.pedidos.add(l.amazonOrderId);
        dias.set(dia, d);
      }
      return {
        periodo: { desde, hasta },
        dias: [...dias].sort(([a], [b]) => a.localeCompare(b)).map(([dia, d]) => ({ dia, ventasEUR: redondear(d.ventasEUR), unidades: d.unidades, pedidos: d.pedidos.size })),
        nota: "Los días sin ventas no aparecen.",
      };
    },
  },

  stock_actual: {
    etiqueta: "Stock en Amazon",
    definicion: {
      name: "stock_actual",
      description:
        "Stock FBA actual de cada producto por región (Europa comparte un único stock entre sus países; Reino Unido tiene el suyo): vendible, reservado, en camino a Amazon y no vendible. Puedes filtrar por un SKU.",
      input_schema: { type: "object", properties: { sku: { type: "string", description: "Solo este SKU (opcional)" } }, additionalProperties: false },
    },
    async ejecutar(e) {
      const stock = await obtenerStock();
      if (!stock) return { error: "Aún no hay datos de stock: se cargan desde la página Stock." };
      const sku = typeof e.sku === "string" && e.sku ? e.sku : null;
      const regiones = new Map(stock.regiones.map((r) => [r.id, r.nombre]));
      return {
        actualizadoEn: stock.actualizadoEn,
        articulos: stock.articulos
          .filter((a) => !sku || a.sku === sku)
          .slice(0, MAX_FILAS)
          .map((a) => ({
            sku: a.sku,
            asin: a.asin,
            nombre: a.nombre.slice(0, 90),
            porRegion: Object.fromEntries(Object.entries(a.porRegion).map(([r, c]) => [regiones.get(r) ?? r, { vendible: c.vendible, reservado: c.reservado, enCamino: c.enCamino, noVendible: c.noVendible }])),
          })),
      };
    },
  },

  gastos_amazon: {
    etiqueta: "Gastos de Amazon",
    definicion: {
      name: "gastos_amazon",
      description:
        "Cargos de la cuenta de Amazon (no las comisiones por venta) por mes y categoría, en EUR: publicidad, almacenamiento FBA, suscripción, Vine, cupones, reciclaje, retiradas, transporte de entrada… Meses en formato YYYY-MM.",
      input_schema: {
        type: "object",
        properties: { desde_mes: { type: "string", description: "Primer mes, YYYY-MM" }, hasta_mes: { type: "string", description: "Último mes, YYYY-MM" } },
        required: ["desde_mes", "hasta_mes"],
        additionalProperties: false,
      },
    },
    async ejecutar(e) {
      if (!esMes(e.desde_mes) || !esMes(e.hasta_mes)) throw new ErrorEntrada("desde_mes y hasta_mes deben ser YYYY-MM");
      const [desde, hasta] = e.desde_mes <= e.hasta_mes ? [e.desde_mes, e.hasta_mes] : [e.hasta_mes, e.desde_mes];
      const nombre = new Map<string, string>(CATEGORIAS.map((c) => [c.id, c.nombre]));
      const meses = new Map<string, Map<string, number>>();
      for (const l of (await obtenerGastos()).lineas) {
        if (l.mes < desde || l.mes > hasta) continue;
        const m = meses.get(l.mes) ?? new Map<string, number>();
        const cat = nombre.get(l.categoria) ?? l.categoria;
        m.set(cat, (m.get(cat) ?? 0) + l.eur);
        meses.set(l.mes, m);
      }
      return {
        meses: [...meses]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([mes, cats]) => ({ mes, totalEUR: redondear([...cats.values()].reduce((s, v) => s + v, 0)), porCategoriaEUR: Object.fromEntries([...cats].map(([c, v]) => [c, redondear(v)])) })),
      };
    },
  },

  vine: {
    etiqueta: "Amazon Vine",
    definicion: {
      name: "vine",
      description:
        "Amazon Vine: las inscripciones de cada producto por país (estado, unidades registradas, reclamadas por los reseñadores y reseñas recibidas) y, en el periodo indicado, las unidades enviadas a reseñadores con su coste (tarifas de Amazon + coste del producto, EUR) y las cuotas de inscripción cobradas.",
      input_schema: {
        type: "object",
        properties: { desde: PROPIEDADES_PERIODO.desde, hasta: PROPIEDADES_PERIODO.hasta },
        required: ["desde", "hasta"],
        additionalProperties: false,
      },
    },
    async ejecutar(e, ctx) {
      const { desde, hasta } = rango(e);
      const [{ pedidos, cuotas }, inscripciones] = await Promise.all([datosVine(), inscripcionesVine()]);
      const pais = new Map(ctx.marketplaces.map((m) => [m.id, m.codigoPais]));
      const porProducto = new Map<string, { titulo: string; pais: string; unidades: number; tarifasEUR: number; costeEUR: number | null }>();
      for (const p of pedidos.filter((x) => x.dia >= desde && x.dia <= hasta)) {
        const clave = `${p.sku}|${p.codigoPais}`;
        const r = porProducto.get(clave) ?? { titulo: p.titulo.slice(0, 90), pais: p.codigoPais, unidades: 0, tarifasEUR: 0, costeEUR: 0 };
        r.unidades += p.unidades;
        r.tarifasEUR = redondear(r.tarifasEUR + p.tarifas);
        r.costeEUR = r.costeEUR === null || p.coste === null ? null : redondear(r.costeEUR + p.coste);
        porProducto.set(clave, r);
      }
      const cuotasPeriodo = cuotas.filter((c) => (c.fecha ?? `${c.mes}-15`) >= desde && (c.fecha ?? `${c.mes}-01`) <= hasta);
      return {
        periodo: { desde, hasta },
        unidadesEnviadas: [...porProducto.entries()].map(([clave, r]) => ({ sku: clave.split("|")[0], ...r })),
        cuotasInscripcionEUR: redondear(cuotasPeriodo.reduce((s, c) => s + c.eur, 0)),
        inscripciones: Object.entries(inscripciones.porMercado).flatMap(([mk, lista]) =>
          lista.map((i) => ({ pais: pais.get(mk) ?? mk, asin: i.asin, nombre: i.nombre.slice(0, 90), estado: i.estado, fechaInscripcion: i.fechaInscripcion, registrado: i.registrado, reclamado: i.reclamado, disponible: i.disponible, resenas: i.resenas })),
        ),
        nota: "Las inscripciones se mantienen a mano desde la página Vine; las unidades enviadas salen de los pedidos.",
      };
    },
  },

  devoluciones: {
    etiqueta: "Devoluciones",
    definicion: {
      name: "devoluciones",
      description:
        "Devoluciones físicas de clientes (FBA) del periodo, del informe de Amazon (último año): unidades devueltas por producto y país, motivos del cliente (UNWANTED_ITEM, DEFECTIVE, NOT_AS_DESCRIBED…), estado de la unidad devuelta (SELLABLE, CUSTOMER_DAMAGED…) y los comentarios de los clientes. Traduce los códigos al español al responder.",
      input_schema: {
        type: "object",
        properties: { ...PROPIEDADES_PERIODO, sku: { type: "string", description: "Solo este SKU (opcional)" } },
        required: ["desde", "hasta"],
        additionalProperties: false,
      },
    },
    async ejecutar(e, ctx) {
      const { desde, hasta } = rango(e);
      const mk = marketplaceDe(e, ctx);
      const sku = typeof e.sku === "string" && e.sku ? e.sku : null;
      await lineasYReembolsos();
      const { filas, actualizadoEn } = await todasLasDevoluciones();
      const codigo = new Map(ctx.marketplaces.map((m) => [m.id, m.codigoPais]));
      const sel = filas.filter((d) => {
        const dia = d.fecha.slice(0, 10);
        return dia >= desde && dia <= hasta && (!mk || d.marketplaceId === mk) && (!sku || d.sku === sku);
      });
      const contar = (clave: (d: (typeof sel)[number]) => string) => {
        const m = new Map<string, number>();
        for (const d of sel) m.set(clave(d), (m.get(clave(d)) ?? 0) + d.unidades);
        return Object.fromEntries([...m].sort((a, b) => b[1] - a[1]));
      };
      return {
        periodo: { desde, hasta },
        informeActualizadoEn: actualizadoEn,
        unidadesDevueltas: sel.reduce((s, d) => s + d.unidades, 0),
        porProducto: contar((d) => d.sku),
        porPais: contar((d) => (d.marketplaceId ? (codigo.get(d.marketplaceId) ?? d.marketplaceId) : "desconocido")),
        porMotivo: contar((d) => d.motivo || "sin motivo"),
        porEstadoUnidad: contar((d) => d.disposicion || "desconocido"),
        comentarios: sel
          .filter((d) => d.comentario?.trim())
          .slice(0, 30)
          .map((d) => ({ fecha: d.fecha.slice(0, 10), sku: d.sku, motivo: d.motivo, comentario: d.comentario.slice(0, 300) })),
        nota: "Los reembolsos sin devolución física no aparecen aquí: están en resumen_ventas y ventas_por_producto.",
      };
    },
  },

  estado_cuenta: {
    etiqueta: "Estado de la cuenta",
    definicion: {
      name: "estado_cuenta",
      description:
        "Salud de la cuenta de vendedor por país: estado de la cuenta, puntuación de Account Health Rating (200 o más es «Adecuado»; 1000 es el máximo) y número de infracciones de políticas por categoría.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
    async ejecutar(_e, ctx) {
      const { porMercado, actualizadoEn } = await obtenerEstadoCuenta();
      const nombre = new Map(ctx.marketplaces.map((m) => [m.id, `${m.pais} (${m.codigoPais})`]));
      const textoCategoria = new Map<string, string>(CATEGORIAS_POLITICAS.map((c) => [c.clave, c.texto]));
      return {
        actualizadoEn,
        paises: Object.values(porMercado).map((m) => ({
          pais: nombre.get(m.marketplaceId) ?? m.marketplaceId,
          estadoCuenta: m.estado,
          puntuacion: m.puntuacion,
          nivel: m.estadoPuntuacion,
          infracciones: Object.fromEntries(Object.entries(m.categorias).filter(([, n]) => n > 0).map(([c, n]) => [textoCategoria.get(c) ?? c, n])),
        })),
      };
    },
  },

  tickets_compra: {
    etiqueta: "Tickets de compra",
    definicion: {
      name: "tickets_compra",
      description:
        "Los tickets de compra que el dueño ha subido a la sección Tickets (gastos propios fuera de Amazon: material, transporte, combustible…): fecha, comercio, concepto, total, IVA y moneda, con totales por mes y por comercio. Puedes buscar un texto en el comercio o el concepto.",
      input_schema: {
        type: "object",
        properties: {
          desde: PROPIEDADES_PERIODO.desde,
          hasta: PROPIEDADES_PERIODO.hasta,
          buscar: { type: "string", description: "Texto a buscar en el comercio, el concepto o la nota (opcional)" },
        },
        required: ["desde", "hasta"],
        additionalProperties: false,
      },
    },
    async ejecutar(e) {
      const { desde, hasta } = rango(e);
      const q = typeof e.buscar === "string" ? e.buscar.trim().toLowerCase() : "";
      const sel = (await listarTickets())
        .filter((t) => t.fecha && t.fecha >= desde && t.fecha <= hasta)
        .filter((t) => !q || `${t.comercio} ${t.concepto} ${t.nota}`.toLowerCase().includes(q))
        .sort((a, b) => a.fecha!.localeCompare(b.fecha!));
      const sumar = (clave: (t: (typeof sel)[number]) => string) => {
        const m = new Map<string, number>();
        for (const t of sel) if (t.total !== null) m.set(clave(t), redondear((m.get(clave(t)) ?? 0) + t.total));
        return Object.fromEntries(m);
      };
      return {
        periodo: { desde, hasta },
        tickets: sel.length,
        totalPorMoneda: sumar((t) => t.moneda),
        ivaPorMoneda: Object.fromEntries([...new Set(sel.map((t) => t.moneda))].map((mon) => [mon, redondear(sel.filter((t) => t.moneda === mon).reduce((s, t) => s + (t.iva ?? 0), 0))])),
        porMes: sumar((t) => `${t.fecha!.slice(0, 7)} ${t.moneda}`),
        porComercio: sumar((t) => `${t.comercio || "sin comercio"} (${t.moneda})`),
        lista: sel.slice(0, MAX_FILAS).map((t) => ({ fecha: t.fecha, comercio: t.comercio, concepto: t.concepto, total: t.total, iva: t.iva, moneda: t.moneda })),
        sinFecha: (await listarTickets()).filter((t) => !t.fecha).length,
      };
    },
  },
};

export const definicionesHerramientas = (): Anthropic.Beta.BetaTool[] => Object.values(HERRAMIENTAS).map((h) => ({ ...h.definicion, eager_input_streaming: true }));

export const etiquetaHerramienta = (nombre: string) => HERRAMIENTAS[nombre]?.etiqueta ?? nombre;

export async function contextoChat(): Promise<Contexto> {
  return { marketplaces: await cargarMarketplaces() };
}

/** Runs a tool; a bad input or a failure comes back as an error result the AI can read and fix. */
export async function ejecutarHerramienta(nombre: string, entrada: unknown, ctx: Contexto): Promise<{ contenido: string; error: boolean }> {
  const h = HERRAMIENTAS[nombre];
  if (!h) return { contenido: `Herramienta desconocida: ${nombre}`, error: true };
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return { contenido: "La entrada debe ser un objeto JSON", error: true };
  try {
    return { contenido: JSON.stringify(await h.ejecutar(entrada as Entrada, ctx)), error: false };
  } catch (e) {
    if (!(e instanceof ErrorEntrada)) console.error(`[chat] herramienta ${nombre}`, e);
    return { contenido: e instanceof Error ? e.message : "Error al consultar los datos", error: true };
  }
}
