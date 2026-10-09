import { estudiosParaVista } from "@/lib/datos/estudiosH10";
import { VistaH10 } from "@/components/h10/VistaH10";

/** Helium 10 analysis: one study per product, its keyword in each country. */
export default async function AnalisisH10Page({ searchParams }: PageProps<"/analisis-h10">) {
  const guardados = await estudiosParaVista();
  // «?estudio=…&pestana=…»: opens on that study and tab (coming back from a competitor's page).
  const sp = await searchParams;
  const uno = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Análisis H10</h1>
        <p className="mt-1 text-sm text-ink-400">Estudios de producto con los datos de Helium 10: qué país conviene, a qué precio y contra quién compites.</p>
      </div>
      <VistaH10
        estudios={guardados.map((g) => g.estudio)}
        palabras={Object.fromEntries(guardados.map((g) => [g.estudio.id, g.palabras]))}
        archivos={Object.fromEntries(guardados.map((g) => [g.estudio.id, g.archivos]))}
        costesPropios={Object.fromEntries(guardados.map((g) => [g.estudio.id, g.costesPropios]))}
        paresAmazon={Object.fromEntries(guardados.map((g) => [g.estudio.id, g.paresAmazon]))}
        inicial={{ estudio: uno(sp.estudio), pestana: uno(sp.pestana) }}
      />
    </div>
  );
}
