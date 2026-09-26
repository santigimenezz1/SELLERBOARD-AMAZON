import { LIMITE_ESCRITURAS, LIMITE_LECTURAS } from "@/lib/datos/consumo";
import { formatNumero } from "@/lib/format";

/**
 * Today's Firestore usage against the free Spark limits. Discreet while low;
 * turns into a visible warning past half of either limit.
 */
export function Consumo({ lecturas, escrituras }: { lecturas: number; escrituras: number }) {
  const pl = (lecturas / LIMITE_LECTURAS) * 100;
  const pe = (escrituras / LIMITE_ESCRITURAS) * 100;
  const peor = Math.max(pl, pe);
  const pct = (v: number) => `${v.toLocaleString("es-ES", { maximumFractionDigits: v < 10 ? 1 : 0 })} %`;
  const texto = `Base de datos hoy: ${formatNumero(lecturas)} lecturas (${pct(pl)}) · ${formatNumero(escrituras)} escrituras (${pct(pe)}) del plan gratuito`;

  if (peor < 50) return <p className="text-center text-xs text-ink-600">{texto}</p>;
  return (
    <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${peor >= 80 ? "border-danger/25 bg-danger/10 text-danger" : "border-warning/25 bg-warning/10 text-warning"}`}>
      ⚠ {texto}. Si llega al 100 %, la app deja de cargar hasta mañana a las 9:00 (nunca genera cargos en el plan gratuito).
    </p>
  );
}
