import { listarCarpetas, listarDocumentos } from "@/lib/datos/documentos";
import { VistaDocumentos } from "@/components/documentos/VistaDocumentos";

/** The company's documents, by folder. The list is read once and kept in memory. */
export default async function DocumentosPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
        <p className="mt-1 text-sm text-ink-400">Los documentos de la empresa ordenados por carpetas, listos para ver o descargar cuando los necesites.</p>
      </div>
      <VistaDocumentos documentos={await listarDocumentos()} carpetas={await listarCarpetas()} />
    </div>
  );
}
