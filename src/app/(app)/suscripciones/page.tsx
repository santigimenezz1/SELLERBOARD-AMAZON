import { listarSuscripciones } from "@/lib/datos/suscripciones";
import { diaMadrid } from "@/lib/datos/fechas";
import { VistaSuscripciones } from "@/components/suscripciones/VistaSuscripciones";

/** Recurring payments and when each renews, with a warning before it's charged. */
export default async function SuscripcionesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suscripciones</h1>
        <p className="mt-1 text-sm text-ink-400">Tus pagos periódicos, cuándo se renueva cada uno y un aviso antes de que te lo cobren.</p>
      </div>
      <VistaSuscripciones lista={await listarSuscripciones()} hoy={diaMadrid(new Date())} />
    </div>
  );
}
