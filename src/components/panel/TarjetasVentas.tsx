import type { Metricas } from "@/lib/datos/panel";
import { formatEuros, formatNumero } from "@/lib/format";

/** Simplified phase 1: only sales and units. */
export function TarjetasVentas({ m }: { m: Metricas }) {
  const tarjetas = [
    { titulo: "Ventas totales", valor: formatEuros(m.ventas), nota: `${formatNumero(m.pedidos)} ${m.pedidos === 1 ? "pedido" : "pedidos"} · IVA incluido` },
    { titulo: "Unidades vendidas", valor: formatNumero(m.unidades), nota: null },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {tarjetas.map((t) => (
        <section key={t.titulo} className="rounded-2xl border border-white/[0.06] bg-ink-900/70 p-5 shadow-soft">
          <h2 className="text-sm font-medium text-ink-300">{t.titulo}</h2>
          <p className="tabular mt-2 text-4xl font-semibold tracking-tight text-ink-100">{t.valor}</p>
          {t.nota && <p className="mt-1 text-sm text-ink-400">{t.nota}</p>}
        </section>
      ))}
    </div>
  );
}
