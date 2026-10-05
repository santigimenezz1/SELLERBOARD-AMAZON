import { listarTickets } from "@/lib/datos/tickets";
import { isIAConfigurada } from "@/lib/ia/leerTicket";
import { VistaTickets } from "@/components/tickets/VistaTickets";

/** Purchase tickets: the photo is kept and the AI reads its date, shop and total. The list is kept in memory. */
export default async function TicketsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
        <p className="mt-1 text-sm text-ink-400">Sube la foto de tus tickets de compra: la IA lee la fecha, el comercio y el total, y quedan ordenados mes a mes.</p>
      </div>
      <VistaTickets tickets={await listarTickets()} iaConfigurada={isIAConfigurada} />
    </div>
  );
}
