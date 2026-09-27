import type { InventarioPais } from "@/lib/amazon/apis";
import { ETIQUETAS_POR_ASIN } from "@/lib/datos/etiquetas";
import { nombrePais } from "@/lib/datos/paises";
import { formatFechaHora, formatNumero } from "@/lib/format";
import { Bandera } from "@/components/Bandera";

type Props = {
  filas: InventarioPais[];
  actualizadoEn: string | null;
  /** Per ASIN, countries (ISO code) where it sold lately: an empty warehouse there means cross-border shipping. */
  paisesConVentas: Record<string, string[]>;
  imagenes: Record<string, string>;
  titulos: Record<string, string>;
};

// EU countries first in a fixed, familiar order; the UK (its own pool) last.
const ORDEN = ["ES", "DE", "FR", "IT", "NL", "BE", "PL", "SE", "IE", "AT", "CZ", "GB"];
const posicion = (p: string) => (ORDEN.includes(p) ? ORDEN.indexOf(p) : ORDEN.length - 1);

/** Units of each listing in each country's warehouses. */
export function InventarioPaises({ filas, actualizadoEn, paisesConVentas, imagenes, titulos }: Props) {
  const vende = (asin: string, pais: string) => paisesConVentas[asin]?.includes(pais) ?? false;
  const paises = [...new Set([...filas.filter((f) => f.unidades > 0).map((f) => f.pais), ...Object.values(paisesConVentas).flat()])].sort((a, b) => posicion(a) - posicion(b));

  // One row per ASIN (a listing can have several SKUs).
  const porAsin = new Map<string, { skus: Set<string>; pais: Record<string, number>; total: number }>();
  for (const f of filas) {
    const p = porAsin.get(f.asin) ?? { skus: new Set<string>(), pais: {}, total: 0 };
    p.skus.add(f.sku);
    p.pais[f.pais] = (p.pais[f.pais] ?? 0) + f.unidades;
    p.total += f.unidades;
    porAsin.set(f.asin, p);
  }
  const productos = [...porAsin.entries()].filter(([, p]) => p.total > 0).sort((a, b) => b[1].total - a[1].total);
  // Countries where some listing sells without any stock of it there.
  const vacios = paises.filter((c) => productos.some(([asin, p]) => vende(asin, c) && !p.pais[c]));

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-semibold tracking-tight text-ink-100">Inventario en cada país</h2>
        <p className="text-xs text-ink-400">
          Unidades de cada listing en los almacenes de cada país, incluidas las reservadas para pedidos
          {actualizadoEn ? ` (actualizado ${formatFechaHora(new Date(actualizadoEn))})` : " (se trae en la próxima sincronización o con «Actualizar stock»)"}.
        </p>
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-ink-900/70">
        {productos.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-400">Aún no hay datos de inventario por país.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-xs text-ink-400">
                  <th scope="col" className="py-2.5 pr-3 pl-5 text-left font-medium">
                    Listing
                  </th>
                  {paises.map((c) => (
                    <th key={c} scope="col" className="px-3 py-2.5 text-right font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <Bandera codigo={c} />
                        {nombrePais(c)}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="py-2.5 pr-5 pl-3 text-right font-medium text-ink-100">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {productos.map(([asin, p]) => {
                  const etiqueta = ETIQUETAS_POR_ASIN[asin];
                  const titulo = [...p.skus].map((s) => titulos[s]).find(Boolean);
                  return (
                    <tr key={asin}>
                      <td className="py-3 pr-3 pl-5">
                        <div className="flex items-center gap-3">
                          <div className="size-10 shrink-0 overflow-hidden rounded-md bg-white">
                            {imagenes[asin] && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={imagenes[asin]} alt="" loading="lazy" className="size-full object-contain p-1" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-ink-100">
                              {asin}
                              {etiqueta && <span className="rounded bg-success/10 px-1.5 py-0.5 font-sans text-[10px] leading-3 font-semibold tracking-wide text-success">{etiqueta}</span>}
                            </p>
                            {titulo && <p className="max-w-[280px] truncate text-xs text-ink-400">{titulo}</p>}
                          </div>
                        </div>
                      </td>
                      {paises.map((c) => {
                        const n = p.pais[c] ?? 0;
                        const vendeAqui = vende(asin, c);
                        return (
                          <td key={c} className="px-3 py-3 text-right">
                            {n > 0 ? (
                              <span className="font-medium text-ink-100">{formatNumero(n)}</span>
                            ) : vendeAqui ? (
                              <span className="font-medium text-warning" title="Vendes aquí pero no hay stock en este país: esas ventas salen de otro almacén, con la tarifa FBA de envío entre países">
                                0
                              </span>
                            ) : (
                              <span className="text-ink-600">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-3 pr-5 pl-3 text-right font-semibold text-ink-100">{formatNumero(p.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {vacios.length > 0 && (
          <p className="border-t border-white/[0.06] px-5 py-3 text-xs text-warning">
            Sin stock en {vacios.map(nombrePais).join(", ")} aunque vendes allí (en naranja): esas ventas se envían desde otro país, con la tarifa FBA de envío entre países (más cara).
          </p>
        )}
      </div>
    </section>
  );
}
