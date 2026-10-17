import { redirect } from "next/navigation";
import { estudiosParaVista, portadasEstudios } from "@/lib/datos/estudiosH10";
import { analizarResenas, notaProducto, resumirEstudio } from "@/lib/datos/h10Analisis";
import { enlaceEstudio, ListaEstudios, type ResumenEstudio } from "@/components/h10/VistaH10";

/** Helium 10 analysis: the studies (one per product) as cards; each opens on its own page. */
export default async function AnalisisH10Page({ searchParams }: PageProps<"/analisis-h10">) {
  // Old links «?estudio=…&pestana=…» go to the study's own page.
  const sp = await searchParams;
  const uno = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const estudio = uno(sp.estudio);
  if (estudio) redirect(enlaceEstudio(estudio, uno(sp.pestana)));

  const guardados = await estudiosParaVista();
  // Each card's picture: the main photo of its market's leader (asked to Amazon once per leader).
  const portadas: Record<string, string | null> = await portadasEstudios().catch(() => ({}));
  // Only what the cards show: the whole studies would weigh half a megabyte for four cards.
  const tarjetas: ResumenEstudio[] = guardados.map(({ estudio: e, archivos }) => {
    const r = e.mercados.length ? resumirEstudio(e) : null;
    return {
      id: e.id,
      nombre: e.nombre,
      descripcion: e.descripcion,
      ejemplo: !!e.ejemplo,
      nota: r ? notaProducto(r, analizarResenas(e)).nota : null,
      paises: e.mercados.map((m) => m.codigoPais),
      mercadoEur: r ? r.mercadoTotalEur : null,
      archivos: archivos.length,
      // Amazon serves any photo smaller with a size before the extension: 600 px fills a card and loads fast.
      portada: portadas[e.id]?.replace(/^(https:\/\/m\.media-amazon\.com\/images\/I\/[^.]+)(\.[a-z]+)$/i, "$1._SL600_$2") ?? null,
    };
  });
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Análisis H10</h1>
        <p className="mt-1 text-sm text-ink-400">Estudios de producto con los datos de Helium 10: qué país conviene, a qué precio y contra quién compites.</p>
      </div>
      <ListaEstudios estudios={tarjetas} />
    </div>
  );
}
