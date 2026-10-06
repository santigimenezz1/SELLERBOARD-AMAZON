import Link from "next/link";
import { formatDiaLargo, formatMoneda } from "@/lib/format";
import { diasEntre, porVencer, proximoPago, type Suscripcion } from "@/lib/datos/suscripcionesCalc";

/** On the Panel: the payments within their warning days, soonest first. Nothing when there are none. */
export function AvisoSuscripciones({ lista, hoy }: { lista: Suscripcion[]; hoy: string }) {
  const avisos = porVencer(lista, hoy)
    .map((s) => ({ s, fecha: proximoPago(s, hoy) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!avisos.length) return null;
  return (
    <div role="alert" className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-xl border border-accent-500/30 bg-accent-500/10 px-4 py-3 text-sm text-accent-300">
      <ul className="flex min-w-0 flex-col gap-1">
        {avisos.map(({ s, fecha }) => {
          const dias = diasEntre(hoy, fecha);
          return (
            <li key={s.id}>
              ⏰ <span className="font-medium text-ink-100">{s.nombre}</span> se paga {dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`} ({formatDiaLargo(fecha)}):{" "}
              <span className="tabular font-medium text-ink-100">{formatMoneda(s.importe, s.moneda)}</span>
            </li>
          );
        })}
      </ul>
      <Link href="/suscripciones" className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-accent-300 hover:bg-accent-500/15">
        Ver suscripciones →
      </Link>
    </div>
  );
}
