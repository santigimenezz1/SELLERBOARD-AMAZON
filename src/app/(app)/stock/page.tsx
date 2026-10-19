import { obtenerStock } from "@/lib/datos/stock";
import { datosVentas } from "@/lib/datos/almacen";
import { cargarUltimaSync } from "@/lib/datos/panel";
import { isAmazonConfigured } from "@/lib/amazon/cliente";
import { VistaStock } from "@/components/stock/VistaStock";
import { obtenerEnvios } from "@/lib/datos/envios";
import { EnviosFBA } from "@/components/stock/EnviosFBA";
import { obtenerInventarioPaises, paisesConVentas as paisesVendidos } from "@/lib/datos/inventarioPaises";
import { InventarioPaises } from "@/components/stock/InventarioPaises";
import { conEuros, costesPorEnvio, obtenerCostesEnvios } from "@/lib/datos/costesEnvios";
import { obtenerCapacidad } from "@/lib/datos/capacidad";
import { CapacidadStock } from "@/components/stock/CapacidadStock";
import type { DatosVentas } from "@/lib/datos/almacen";
import { modoDemo } from "@/lib/auth/demo";
import { AvisoDemo } from "@/components/AvisoDemo";

/** The demo's stock: the two regions with no products, so every card shows at zero. */
const stockVacio = () => ({
  actualizadoEn: new Date().toISOString(),
  regiones: [
    { id: "eu", nombre: "Europa", bandera: "eu", marketplaceIds: [], paises: ["ES", "DE", "FR", "IT"] },
    { id: "uk", nombre: "Reino Unido", bandera: "gb", marketplaceIds: [], paises: ["GB"] },
  ],
  articulos: [],
});

const cargarTodo = () => Promise.all([obtenerStock(), cargarUltimaSync(), obtenerEnvios(), obtenerInventarioPaises(), obtenerCostesEnvios(), obtenerCapacidad()]);

/** FBA stock per region and inbound shipments. Everything comes from memory after the first load. */
export default async function StockPage() {
  // A guest sees it empty: nothing of the owner's is loaded.
  const demo = await modoDemo();
  const [stock, ultima, envios, inventario, costesDoc, capacidad] = demo
    ? ([
        stockVacio(),
        null,
        { envios: [], actualizadoEn: null },
        { filas: [], actualizadoEn: null },
        { cargos: {}, manuales: {}, historico: false },
        { uso: { eu: { enAlmacen: 0, enCamino: 0 }, uk: { enAlmacen: 0, enCamino: 0 } }, limites: { eu: null, uk: null }, usoActualizadoEn: null, limitesActualizadosEn: null },
      ] as unknown as Awaited<ReturnType<typeof cargarTodo>>)
    : await cargarTodo();
  const costes = demo ? {} : await conEuros(costesPorEnvio(costesDoc), Object.fromEntries(envios.envios.map((e) => [e.id, e.creado])));
  const vacio: DatosVentas = { lineas: [], reembolsos: [], imagenes: new Map() };
  const { imagenes, lineas } = demo ? vacio : await datosVentas(ultima?.id ?? null);

  // Titles from the orders when Amazon's inventory report has none (skipping its "-" placeholders).
  const titulos: Record<string, string> = {};
  // SKU → ASIN for the shipments table (stock first, orders for SKUs no longer in stock).
  const asinDe: Record<string, string> = {};
  for (const a of stock?.articulos ?? []) if (a.asin) asinDe[a.sku] = a.asin;
  for (const l of lineas) if (l.asin) asinDe[l.sku] ??= l.asin;

  const paisesConVentas = paisesVendidos(lineas);
  for (const l of lineas) if (!titulos[l.sku] && l.titulo && l.titulo.trim().length > 1) titulos[l.sku] = l.titulo;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stock FBA</h1>
        <p className="mt-1 text-sm text-ink-400">Unidades en los almacenes de Amazon, por región. Se actualiza en cada sincronización o con el botón.</p>
      </div>
      {demo && <AvisoDemo />}
      {!isAmazonConfigured ? (
        <p className="rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">Faltan las credenciales de Amazon en .env.local.</p>
      ) : (
        <>
          <VistaStock stock={stock} imagenes={Object.fromEntries(imagenes)} titulos={titulos} capacidad={<CapacidadStock key="capacidad" capacidad={capacidad} />} />
          <InventarioPaises filas={inventario.filas} actualizadoEn={inventario.actualizadoEn} paisesConVentas={paisesConVentas} imagenes={Object.fromEntries(imagenes)} titulos={titulos} />
          <EnviosFBA envios={envios.envios} actualizadoEn={envios.actualizadoEn} asinDe={asinDe} costes={costes} />
        </>
      )}
    </div>
  );
}
