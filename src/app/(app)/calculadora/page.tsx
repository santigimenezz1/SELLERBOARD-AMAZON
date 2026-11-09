import { AJUSTES_INICIALES, leerAjustesCalc } from "@/lib/datos/calculadora";
import { VistaCalculadora } from "@/components/calculadora/VistaCalculadora";
import { modoDemo } from "@/lib/auth/demo";
import { AvisoDemo } from "@/components/AvisoDemo";

/** Amazon's revenue calculator, rebuilt: search a product, its fees at a price and what's left of each sale. 1 read. */
export default async function CalculadoraPage() {
  // A guest sees it empty: nothing of the owner's is loaded.
  const demo = await modoDemo();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-2xl font-semibold tracking-tight">Calculadora</h1>
        <p className="text-sm text-ink-400">Como la calculadora de rentabilidad de Amazon: busca un ASIN y mira tarifas, costes y beneficio.</p>
      </div>
      {demo && <AvisoDemo />}
      <VistaCalculadora ajustesIniciales={demo ? AJUSTES_INICIALES : await leerAjustesCalc()} demo={demo} />
    </div>
  );
}
