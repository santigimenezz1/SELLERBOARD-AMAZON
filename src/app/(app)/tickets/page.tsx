import { redirect } from "next/navigation";

/** Tickets now live at the bottom of «Documentos»: old links land there. */
export default function TicketsPage() {
  redirect("/documentos#tickets");
}
