import Link from "next/link";
import { notFound } from "next/navigation";
import { estudiosParaVista } from "@/lib/datos/estudiosH10";
import { VistaH10 } from "@/components/h10/VistaH10";

/** One Helium 10 study with all its tabs. «?pestana=…» opens on that tab (coming back from a competitor's page). */
export default async function EstudioH10Page({ params, searchParams }: PageProps<"/analisis-h10/[id]">) {
  const { id } = await params;
  const g = (await estudiosParaVista()).find((x) => x.estudio.id === id);
  if (!g) notFound();
  const pestana = (await searchParams).pestana;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/analisis-h10" className="text-sm text-ink-400 hover:text-ink-100">
          ← Todos los estudios
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{g.estudio.nombre}</h1>
      </div>
      <VistaH10
        key={g.estudio.id}
        estudio={g.estudio}
        palabras={g.palabras}
        archivos={g.archivos}
        costesPropios={g.costesPropios}
        paresAmazon={g.paresAmazon}
        inicial={{ pestana: typeof pestana === "string" ? pestana : undefined }}
      />
    </div>
  );
}
