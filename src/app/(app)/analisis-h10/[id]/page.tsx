import Link from "next/link";
import { notFound } from "next/navigation";
import { estudiosParaVista } from "@/lib/datos/estudiosH10";
import { usuarioDelEstudio } from "@/lib/auth/estudios";
import { VistaH10 } from "@/components/h10/VistaH10";

/** One Helium 10 study with all its tabs. «?pestana=…» opens on that tab (coming back from a competitor's page). */
export default async function EstudioH10Page({ params, searchParams }: PageProps<"/analisis-h10/[id]">) {
  const { id } = await params;
  // Another user's study is as if it didn't exist.
  const user = await usuarioDelEstudio(id);
  const g = user ? (await estudiosParaVista()).find((x) => x.estudio.id === id) : undefined;
  if (!g || !user) notFound();
  const pestana = (await searchParams).pestana;
  return (
    <div className="flex flex-col gap-4">
      {/* The study's name, rename and delete are in its header, inside the view. */}
      <Link href="/analisis-h10" className="w-fit text-sm text-ink-400 hover:text-ink-100">
        ← Todos los estudios
      </Link>
      <VistaH10
        key={g.estudio.id}
        estudio={g.estudio}
        palabras={g.palabras}
        archivos={g.archivos}
        costesPropios={g.costesPropios}
        paresAmazon={g.paresAmazon}
        inicial={{ pestana: typeof pestana === "string" ? pestana : undefined }}
        invitado={user.rol === "invitado"}
      />
    </div>
  );
}
