import { datosTendencias, type DatosTendencias } from "@/lib/datos/tendencias";
import { modoDemo } from "@/lib/auth/demo";
import { AvisoDemo } from "@/components/AvisoDemo";
import { VistaTendencias } from "@/components/tendencias/VistaTendencias";

/** No orders at all (a guest's empty demo). */
const sinDatos = (): DatosTendencias => ({ ventas: { mks: [], asins: [], filas: [] }, listings: [], paises: [], generadoEn: Date.now(), desde: null });

/** When buyers purchase (time of day, weekday), from the orders already in memory. */
export default async function TendenciasPage() {
  // A guest sees it empty: nothing of the owner's is loaded.
  const demo = await modoDemo();
  const datos = demo ? sinDatos() : await datosTendencias();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tendencias</h1>
        <p className="mt-1 text-sm text-ink-400">A qué hora y qué día compra la gente tus productos, en la hora local de cada comprador.</p>
      </div>
      {demo && <AvisoDemo />}
      <VistaTendencias datos={datos} />
    </div>
  );
}
