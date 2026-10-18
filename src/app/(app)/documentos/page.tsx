import { listarCarpetas, listarDocumentos } from "@/lib/datos/documentos";
import { listarTickets } from "@/lib/datos/tickets";
import { isIAConfigurada } from "@/lib/ia/leerTicket";
import { VistaDocumentos } from "@/components/documentos/VistaDocumentos";
import { modoDemo } from "@/lib/auth/demo";
import { AvisoDemo } from "@/components/AvisoDemo";
import { VistaTickets } from "@/components/tickets/VistaTickets";

/**
 * The company's documents, by folder, and below them the purchase tickets (the photo is kept and the AI reads its
 * date, shop and total). Both lists are read once and kept in memory.
 */
export default async function DocumentosPage() {
  // A guest sees it empty: nothing of the owner's is loaded.
  const demo = await modoDemo();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
        <p className="mt-1 text-sm text-ink-400">Los documentos de la empresa ordenados por carpetas, listos para ver o descargar cuando los necesites.</p>
      </div>
      {demo && <AvisoDemo />}
      <VistaDocumentos documentos={demo ? [] : await listarDocumentos()} carpetas={demo ? [] : await listarCarpetas()} />

      <section id="tickets" className="mt-6 flex scroll-mt-28 flex-col gap-6 border-t border-white/[0.06] pt-8">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Tickets</h2>
          <p className="mt-1 text-sm text-ink-400">Sube la foto de tus tickets de compra: la IA lee la fecha, el comercio y el total, y quedan ordenados mes a mes.</p>
        </div>
        <VistaTickets tickets={demo ? [] : await listarTickets()} iaConfigurada={isIAConfigurada} />
      </section>
    </div>
  );
}
