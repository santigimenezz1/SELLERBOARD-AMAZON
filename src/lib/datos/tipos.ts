/**
 * Firestore document shapes. Every amount is in EUR: orders from non-euro
 * marketplaces (UK, SE, PL…) are converted at sync time with the ECB rate of
 * the order date, so totals across countries can be added up directly.
 */

/** Colección `pedidos`: una línea de pedido (un SKU dentro de un pedido). Id: `${amazonOrderId}_${orderItemId}`. */
export type Pedido = {
  id: string;
  amazonOrderId: string;
  orderItemId: string;
  fecha: Date;
  marketplaceId: string;
  pais: string;
  /** Estado de Amazon: PENDING, UNSHIPPED, SHIPPED, CANCELLED… Los CANCELLED no cuentan en el panel. */
  estado: string;
  sku: string;
  asin: string;
  titulo: string;
  unidades: number;
  /** Lo que pagó el cliente (IVA incluido cuando Amazon lo incluye en el precio). */
  ventaTotal: number;
  /** IVA contenido en ventaTotal: no es dinero del vendedor, se resta en beneficioNeto. */
  impuestos: number;
  /** true si Amazon no informó el IVA y se ha estimado con el tipo general del país. */
  ivaEstimado: boolean;
  comisionesAmazon: number;
  /** Lo devuelto al cliente, IVA incluido. */
  reembolso: number;
  /** IVA contenido en el reembolso (ese IVA ya no se debe, así que no se descuenta dos veces). */
  impuestosReembolso: number;
  costeProducto: number | null;
  beneficioNeto: number | null;
  /** true cuando Amazon ya ha registrado el cargo del envío (y por tanto sus comisiones reales). */
  liquidado: boolean;
  /** Moneda original del marketplace y cuántos EUR vale 1 unidad de ella en la fecha del pedido. */
  moneda: string;
  tipoCambio: number;
  sincronizadoEn: Date;
};

/** Colección `costesProducto`. Id: el SKU (codificado, ver idDocSku). */
export type CosteProducto = {
  sku: string;
  costeUnitario: number;
  actualizadoEn: Date;
};

/** Colección `sincronizaciones`. */
export type Sincronizacion = {
  fecha: Date;
  pedidosNuevos: number;
  errores: string[] | null;
  /** Pedidos actualizados en Amazon hasta este instante ya están guardados: la próxima sincronización sigue desde aquí. */
  cursorPedidos: Date | null;
  /** Ídem para las transacciones de la Finances API. */
  cursorFinanzas: Date | null;
  pedidosActualizados: number;
  transacciones: number;
  duracionMs: number;
};

/** Documento `config/marketplaces`: los marketplaces activos según la Sellers API. */
export type Marketplace = {
  id: string;
  pais: string;
  codigoPais: string;
  dominio: string;
  moneda: string;
};

/** Firestore document ids can't contain "/"; SKUs occasionally do. */
export function idDocSku(sku: string): string {
  return encodeURIComponent(sku).replace(/\./g, "%2E");
}

type CamposBeneficio = "ventaTotal" | "impuestos" | "comisionesAmazon" | "reembolso" | "impuestosReembolso" | "costeProducto";

/**
 * (ventaTotal - IVA) - comisiones - (reembolso - IVA del reembolso) - coste,
 * o null si falta el coste. Todo sin IVA: ni el cobrado ni el devuelto son del vendedor.
 */
export function calcularBeneficio(p: Pick<Pedido, CamposBeneficio>): number | null {
  if (p.costeProducto === null) return null;
  return redondear(p.ventaTotal - p.impuestos - p.comisionesAmazon - (p.reembolso - p.impuestosReembolso) - p.costeProducto);
}

export function redondear(v: number): number {
  return Math.round(v * 100) / 100;
}
