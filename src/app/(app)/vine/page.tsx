import Link from "next/link";
import { datosVine, type PedidoVine } from "@/lib/datos/vine";
import { diaMadrid, sumarDias } from "@/lib/datos/fechas";
import { formatEuros, formatMoneda, formatNumero } from "@/lib/format";
import { Bandera } from "@/components/Bandera";

const PERIODOS = [
  { id: "30", nombre: "30 días", dias: 30 },
  { id: "90", nombre: "90 días", dias: 90 },
  { id: "todo", nombre: "Desde enero", dias: 0 },
] as const;

const fecha = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const nombreMes = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
const suma = (ps: PedidoVine[], k: "unidades" | "tarifas") => ps.reduce((s, p) => s + p[k], 0);
const sumaCoste = (ps: PedidoVine[]) => ps.reduce((s, p) => s + (p.coste ?? 0), 0);

function Tarjeta({ titulo, color = "#2c90b6", derecha, children }: { titulo: string; color?: string; derecha?: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="min-w-0 overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-white" style={{ background: color }}>
        <h2 className="text-[15px] leading-tight font-semibold">{titulo}</h2>
        {derecha}
      </header>
      {children}
    </article>
  );
}

function Chip({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={activo ? "true" : undefined}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${activo ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:border-white/[0.16] hover:text-ink-100"}`}
    >
      {children}
    </Link>
  );
}

/** Vine: units given to reviewers and what they cost, per country, with the enrollment fees. */
export default async function VinePage({ searchParams }: PageProps<"/vine">) {
  const sp = await searchParams;
  const periodo = PERIODOS.find((p) => p.id === sp.p) ?? PERIODOS[1];
  const { pedidos: todos, cuotas: todasCuotas } = await datosVine();
  const desde = periodo.dias ? sumarDias(diaMadrid(new Date()), -(periodo.dias - 1)) : "0000-00-00";
  const delPeriodo = todos.filter((p) => p.dia >= desde);

  const paises = [...new Map(delPeriodo.map((p) => [p.marketplaceId, { id: p.marketplaceId, pais: p.pais, codigoPais: p.codigoPais }])).values()].sort((a, b) => a.pais.localeCompare(b.pais, "es"));
  const mk = typeof sp.mk === "string" && paises.some((p) => p.id === sp.mk) ? sp.mk : null;
  const pedidos = mk ? delPeriodo.filter((p) => p.marketplaceId === mk) : delPeriodo;
  const uk = mk === "A1F83G8C2ARO7P";
  // Enrollment fees are charged per region (Europe / UK), not per country.
  const cuotas = todasCuotas.filter((c) => (c.fecha ?? `${c.mes}-15`) >= desde && (!mk || c.region === (uk ? "uk" : "eu")));
  const url = (cambio: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const p = "p" in cambio ? cambio.p : periodo.id;
    const m = "mk" in cambio ? cambio.mk : mk;
    if (p && p !== "90") q.set("p", p);
    if (m) q.set("mk", m);
    const s = q.toString();
    return s ? `/vine?${s}` : "/vine";
  };

  const unidades = suma(pedidos, "unidades");
  const tarifas = suma(pedidos, "tarifas");
  const coste = sumaCoste(pedidos);
  const totalCuotas = cuotas.reduce((s, c) => s + c.eur, 0);
  const total = tarifas + coste + totalCuotas;
  const estimadas = pedidos.filter((p) => p.tarifasEstimadas).length;
  const sinCoste = pedidos.filter((p) => p.coste === null).length;

  const cifras = [
    { titulo: "Unidades enviadas", valor: formatNumero(unidades), color: "#3987e5" },
    { titulo: "Tarifas de Amazon", valor: formatEuros(-tarifas), color: "#2993ab" },
    { titulo: "Coste del producto", valor: formatEuros(-coste), color: "#318dc8" },
    { titulo: "Cuotas de inscripción", valor: formatEuros(-totalCuotas), color: "#21988d" },
    { titulo: "Coste total", valor: formatEuros(-total), color: "#199e70" },
    { titulo: "Coste por unidad", valor: unidades ? formatEuros(-(total / unidades)) : "—", color: "#3fb68b" },
  ];

  // Per country and listing.
  const porPais = [...new Set(pedidos.map((p) => p.marketplaceId))].map((id) => {
    const ps = pedidos.filter((p) => p.marketplaceId === id);
    const porListing = [...new Set(ps.map((p) => p.etiqueta ?? p.sku))].map((l) => ({ nombre: l, unidades: suma(ps.filter((p) => (p.etiqueta ?? p.sku) === l), "unidades") }));
    return { id, pais: ps[0].pais, codigoPais: ps[0].codigoPais, unidades: suma(ps, "unidades"), porListing, tarifas: suma(ps, "tarifas"), coste: sumaCoste(ps), ultima: ps[0].dia };
  }).sort((a, b) => b.unidades - a.unidades);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vine</h1>
        <p className="mt-1 text-sm text-ink-400">Las unidades que Amazon entrega gratis a los reseñadores de Vine y lo que te cuestan, país por país.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {PERIODOS.map((p) => (
            <Chip key={p.id} href={url({ p: p.id })} activo={p.id === periodo.id}>
              {p.nombre}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip href={url({ mk: null })} activo={mk === null}>
            Todos los países
          </Chip>
          {paises.map((p) => (
            <Chip key={p.id} href={url({ mk: p.id })} activo={mk === p.id}>
              <Bandera codigo={p.codigoPais} />
              {p.pais}
            </Chip>
          ))}
        </div>
      </div>

      {/* Summary tiles */}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cifras.map((x) => (
          <li key={x.titulo} className="min-w-0 overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
            <p className="truncate px-3 py-1.5 text-xs font-semibold text-white" style={{ background: x.color }}>
              {x.titulo}
            </p>
            <p className="tabular px-3 py-2.5 text-xl font-semibold text-ink-100">{x.valor}</p>
          </li>
        ))}
      </ul>
      {(estimadas > 0 || sinCoste > 0) && (
        <p className="-mt-3 text-xs text-ink-500">
          {estimadas > 0 && `${estimadas} ${estimadas === 1 ? "unidad aún no liquidada" : "unidades aún no liquidadas"}: sus tarifas son las de la logística FBA de ese país, hasta que Amazon dé las reales. `}
          {sinCoste > 0 && `${sinCoste} sin coste en su escandallo.`}
        </p>
      )}

      {/* Per country */}
      <Tarjeta titulo="Por país" derecha={<span className="text-xs text-white/80">{porPais.length} países</span>}>
        {porPais.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-400">No hay unidades de Vine en este periodo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[640px] text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-xs text-ink-400">
                  <th className="py-2.5 pr-3 pl-4 font-medium">País</th>
                  <th className="px-3 py-2.5 text-right font-medium">Unidades</th>
                  <th className="px-3 py-2.5 font-medium">Por listing</th>
                  <th className="px-3 py-2.5 text-right font-medium">Tarifas</th>
                  <th className="px-3 py-2.5 text-right font-medium">Coste producto</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th className="py-2.5 pr-4 pl-3 text-right font-medium">Última</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {porPais.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-3 pl-4 text-ink-100">
                      <span className="inline-flex items-center gap-2">
                        <Bandera codigo={p.codigoPais} />
                        {p.pais}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-ink-100">{formatNumero(p.unidades)}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-300">{p.porListing.map((l) => `${l.nombre}: ${l.unidades}`).join(" · ")}</td>
                    <td className="px-3 py-2.5 text-right text-ink-100">{formatEuros(-p.tarifas)}</td>
                    <td className="px-3 py-2.5 text-right text-ink-100">{formatEuros(-p.coste)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-danger">{formatEuros(-(p.tarifas + p.coste))}</td>
                    <td className="py-2.5 pr-4 pl-3 text-right text-ink-400">{fecha(p.ultima)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {/* Enrollment fees */}
      <Tarjeta titulo="Cuotas de inscripción a Vine" color="#21988d" derecha={<span className="text-xs text-white/90">{formatEuros(-totalCuotas)}</span>}>
        {cuotas.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-400">Sin cuotas de inscripción en este periodo.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {cuotas.map((c, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-32 shrink-0 text-ink-400">{c.fecha ? fecha(c.fecha) : nombreMes(c.mes)}</span>
                <span className="inline-flex min-w-0 flex-1 items-center gap-2 text-ink-300">
                  {c.region === "uk" ? <Bandera codigo="GB" /> : <span aria-hidden className="fi fi-eu rounded-[2px]" />}
                  {c.region === "uk" ? "Reino Unido" : "Europa"}
                </span>
                <span className="tabular text-right text-ink-100">
                  {formatMoneda(-c.importe, c.moneda)}
                  {c.moneda !== "EUR" && <span className="ml-1 text-xs text-ink-400">≈ {formatEuros(-c.eur)}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[11px] text-ink-500">Lo que Amazon cobra por inscribir un producto en Vine, con su IVA. Se cobra por región (Europa / Reino Unido), no por país.</p>
      </Tarjeta>

      {/* Units */}
      <Tarjeta titulo="Unidades enviadas a Vine" color="#8b7cf6" derecha={<span className="text-xs text-white/90">{formatNumero(unidades)} unidades</span>}>
        {pedidos.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-400">No hay unidades de Vine en este periodo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[720px] text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-xs text-ink-400">
                  <th className="py-2.5 pr-3 pl-4 font-medium">Fecha</th>
                  <th className="px-3 py-2.5 font-medium">País</th>
                  <th className="px-3 py-2.5 font-medium">Listing</th>
                  <th className="px-3 py-2.5 font-medium">Pedido</th>
                  <th className="px-3 py-2.5 text-right font-medium">Tarifas</th>
                  <th className="py-2.5 pr-4 pl-3 text-right font-medium">Coste</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {pedidos.map((p) => (
                  <tr key={`${p.orderId}-${p.sku}`}>
                    <td className="py-2 pr-3 pl-4 text-ink-300">{fecha(p.dia)}</td>
                    <td className="px-3 py-2 text-ink-300">
                      <span className="inline-flex items-center gap-2">
                        <Bandera codigo={p.codigoPais} />
                        {p.pais}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {p.etiqueta ? (
                        <span className="rounded bg-success/10 px-1 py-px text-[10px] font-semibold tracking-wide text-success">{p.etiqueta}</span>
                      ) : (
                        <span className="font-mono text-xs text-ink-400">{p.sku}</span>
                      )}
                      {p.unidades > 1 && <span className="ml-1.5 text-xs text-ink-400">× {p.unidades}</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-ink-400">{p.orderId}</td>
                    <td className="px-3 py-2 text-right text-ink-100">
                      {formatEuros(-p.tarifas)}
                      {p.tarifasEstimadas && <span className="ml-1 text-[10px] text-warning">est.</span>}
                    </td>
                    <td className="py-2 pr-4 pl-3 text-right text-ink-100">{p.coste !== null ? formatEuros(-p.coste) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[11px] leading-snug text-ink-500">
          Amazon no marca los pedidos de Vine: aquí están los pedidos con descuento del 100 % (sin contar reemplazos). Las reseñas de Vine no las da la API de Amazon; las ves en Seller Central → Publicidad → Vine.
        </p>
      </Tarjeta>
    </div>
  );
}
