import { ESTUDIOS_DEMO } from "@/lib/datos/h10Demo";
import { PALABRAS_DEMO } from "@/lib/datos/h10DemoPalabras";
import { RESENAS_DEMO } from "@/lib/datos/h10DemoResenas";
import { estudiosParaVista } from "@/lib/datos/estudiosH10";
import { VistaH10 } from "@/components/h10/VistaH10";

/** Helium 10 analysis: one study per product, its keyword in each country. Stored studies first, then the samples. */
export default async function AnalisisH10Page() {
  const guardados = await estudiosParaVista();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Análisis H10</h1>
        <p className="mt-1 text-sm text-ink-400">Estudios de producto con los datos de Helium 10: qué país conviene, a qué precio y contra quién compites.</p>
      </div>
      <VistaH10
        estudios={[...guardados.map((g) => g.estudio), ...ESTUDIOS_DEMO]}
        palabras={{ ...PALABRAS_DEMO, ...Object.fromEntries(guardados.map((g) => [g.estudio.id, g.palabras])) }}
        resenas={RESENAS_DEMO}
        archivos={Object.fromEntries(guardados.map((g) => [g.estudio.id, g.archivos]))}
        costesPropios={Object.fromEntries(guardados.map((g) => [g.estudio.id, g.costesPropios]))}
        paresAmazon={Object.fromEntries(guardados.map((g) => [g.estudio.id, g.paresAmazon]))}
      />
    </div>
  );
}
