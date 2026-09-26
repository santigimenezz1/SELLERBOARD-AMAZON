import { obtenerStock } from "@/lib/datos/stock";
import { datosVentas } from "@/lib/datos/almacen";
import { cargarUltimaSync } from "@/lib/datos/panel";
import { isAmazonConfigured } from "@/lib/amazon/cliente";
import { VistaStock } from "@/components/stock/VistaStock";

/** FBA stock per region. ~1 Firestore read per load: the snapshot and the photos come from memory. */
export default async function StockPage() {
  const [stock, ultima] = await Promise.all([obtenerStock(), cargarUltimaSync()]);
  const { imagenes, lineas } = await datosVentas(ultima?.id ?? null);

  // Titles from the orders when Amazon's inventory report has none (skipping its "-" placeholders).
  const titulos: Record<string, string> = {};
  for (const l of lineas) if (!titulos[l.sku] && l.titulo && l.titulo.trim().length > 1) titulos[l.sku] = l.titulo;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stock FBA</h1>
        <p className="mt-1 text-sm text-ink-400">Unidades en los almacenes de Amazon, por región. Se actualiza en cada sincronización o con el botón.</p>
      </div>
      {!isAmazonConfigured ? (
        <p className="rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">Faltan las credenciales de Amazon en .env.local.</p>
      ) : (
        <VistaStock stock={stock} imagenes={Object.fromEntries(imagenes)} titulos={titulos} />
      )}
    </div>
  );
}
