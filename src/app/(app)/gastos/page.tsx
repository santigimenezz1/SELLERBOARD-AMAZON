import { VistaGastos } from "@/components/gastos/VistaGastos";
import { obtenerContabilidad } from "@/lib/datos/contabilidad";
import { modoDemo } from "@/lib/auth/demo";
import { AvisoDemo } from "@/components/AvisoDemo";

export default async function GastosPage() {
  // A guest sees it empty: nothing of the owner's is loaded.
  const demo = await modoDemo();
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gastos</h1>
        <p className="mt-1 text-sm text-ink-400">La cuenta de resultados de cada mes: lo que te dejan tus ventas, lo que te cobra Amazon y si ganas o pierdes.</p>
      </div>
      <div className="flex max-w-5xl flex-col gap-6">
        {demo && <AvisoDemo />}
        <VistaGastos contabilidad={demo ? [] : await obtenerContabilidad()} />
      </div>
    </div>
  );
}
