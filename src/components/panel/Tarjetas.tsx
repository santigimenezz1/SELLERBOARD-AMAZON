import type { Metricas } from "@/lib/datos/panel";
import { formatEuros, formatNumero, formatPorcentaje } from "@/lib/format";

export function Tarjetas({ m }: { m: Metricas }) {
  const pequenas = [
    { titulo: "Ventas totales", valor: formatEuros(m.ventas), nota: `${formatNumero(m.pedidos)} ${m.pedidos === 1 ? "pedido" : "pedidos"}` },
    { titulo: "Unidades vendidas", valor: formatNumero(m.unidades) },
    { titulo: "Comisiones de Amazon", valor: formatEuros(m.comisiones), negativo: true },
    { titulo: "Reembolsos", valor: formatEuros(m.reembolsos), negativo: true },
    { titulo: "Coste de producto", valor: formatEuros(m.coste), negativo: true },
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      {/* Net profit is the number that matters: it gets the big card. */}
      <section className="relative overflow-hidden rounded-2xl border border-serie-beneficio/30 bg-gradient-to-br from-serie-beneficio/[0.14] to-ink-900/80 p-5 shadow-soft">
        <h2 className="text-sm font-medium text-ink-300">Beneficio neto</h2>
        <p className={`tabular mt-2 text-4xl font-semibold tracking-tight ${m.beneficio < 0 ? "text-danger" : "text-ink-100"}`}>{formatEuros(m.beneficio)}</p>
        <p className="mt-1 text-sm text-ink-300">
          Margen <span className="tabular font-medium text-ink-100">{formatPorcentaje(m.margen)}</span>
        </p>
        {(m.unidadesSinCoste > 0 || m.pedidosSinLiquidar > 0) && (
          <ul className="mt-4 space-y-1.5 text-xs leading-relaxed">
            {m.unidadesSinCoste > 0 && (
              <li className="flex gap-1.5 text-warning">
                <span aria-hidden>⚠</span>
                <span>
                  No incluye {formatNumero(m.unidadesSinCoste)} {m.unidadesSinCoste === 1 ? "unidad" : "unidades"} sin coste de producto configurado.
                </span>
              </li>
            )}
            {m.pedidosSinLiquidar > 0 && (
              <li className="flex gap-1.5 text-ink-400">
                <span aria-hidden>◷</span>
                <span>
                  {formatNumero(m.pedidosSinLiquidar)} {m.pedidosSinLiquidar === 1 ? "pedido aún no liquidado" : "pedidos aún no liquidados"} por Amazon: sus comisiones todavía no
                  cuentan.
                </span>
              </li>
            )}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {pequenas.map((t) => (
          <section key={t.titulo} className="rounded-2xl border border-white/[0.06] bg-ink-900/70 p-4">
            <h2 className="text-[13px] text-ink-400">{t.titulo}</h2>
            <p className="tabular mt-2 text-xl font-semibold tracking-tight text-ink-100">
              {t.negativo && t.valor !== formatEuros(0) && <span className="text-ink-400">−</span>}
              {t.valor}
            </p>
            {t.nota && <p className="mt-1 text-xs text-ink-400">{t.nota}</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
