import { redirect } from "next/navigation";
import { estudiosParaVista } from "@/lib/datos/estudiosH10";
import { enlaceEstudio, ListaEstudios } from "@/components/h10/VistaH10";

/** Helium 10 analysis: the studies (one per product) as cards; each opens on its own page. */
export default async function AnalisisH10Page({ searchParams }: PageProps<"/analisis-h10">) {
  // Old links «?estudio=…&pestana=…» go to the study's own page.
  const sp = await searchParams;
  const uno = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const estudio = uno(sp.estudio);
  if (estudio) redirect(enlaceEstudio(estudio, uno(sp.pestana)));

  const guardados = await estudiosParaVista();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Análisis H10</h1>
        <p className="mt-1 text-sm text-ink-400">Estudios de producto con los datos de Helium 10: qué país conviene, a qué precio y contra quién compites. Cada estudio se abre en una pestaña nueva.</p>
      </div>
      <ListaEstudios estudios={guardados.map((g) => g.estudio)} archivos={Object.fromEntries(guardados.map((g) => [g.estudio.id, g.archivos.length]))} />
    </div>
  );
}
