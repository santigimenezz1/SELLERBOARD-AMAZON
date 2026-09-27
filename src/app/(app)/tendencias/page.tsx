import { datosTendencias } from "@/lib/datos/tendencias";
import { VistaTendencias } from "@/components/tendencias/VistaTendencias";

/** When buyers purchase (time of day, weekday), from the orders already in memory. */
export default async function TendenciasPage() {
  const datos = await datosTendencias();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tendencias</h1>
        <p className="mt-1 text-sm text-ink-400">A qué hora y qué día compra la gente tus productos, en la hora local de cada comprador.</p>
      </div>
      <VistaTendencias datos={datos} />
    </div>
  );
}
