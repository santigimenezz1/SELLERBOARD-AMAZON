import Link from "next/link";
import { datosVine, inscripcionesVine } from "@/lib/datos/vine";
import { marketplaceConocido } from "@/lib/datos/marketplacesConocidos";
import { listarProductos } from "@/lib/datos/productos";
import { formatEuros, formatNumero } from "@/lib/format";
import { Bandera } from "@/components/Bandera";
import { TablaInscripciones } from "@/components/vine/TablaInscripciones";
import { imagenesCatalogo } from "@/lib/amazon/apis";

// Photos of enrolled ASINs the app doesn't follow (a parent ASIN, an old listing), asked to the catalog once.
const g = globalThis as unknown as { __fotosVine?: Map<string, string | null> };
async function fotos(asins: string[], mk: string): Promise<Record<string, string>> {
  const cache = (g.__fotosVine ??= new Map());
  const faltan = asins.filter((a) => !cache.has(a));
  if (faltan.length) {
    const r = await imagenesCatalogo(faltan, mk).catch(() => []);
    for (const a of faltan) cache.set(a, r.find((x) => x.asin === a)?.imagen ?? null);
  }
  return Object.fromEntries(asins.filter((a) => cache.get(a)).map((a) => [a, cache.get(a)!]));
}

/** The marketplaces with Vine, amazon.es first. */
const MERCADOS = ["A1RKKUPIHCS9HS", "A1PA6795UKMFR9", "A13V1IB3VIYZZH", "APJ6JRA9NG5V4", "A1805IZSGTT6HS", "A1F83G8C2ARO7P"];
const fecha = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Vine, country by country: the enrollments (as in Seller Central) and the units sent to reviewers. */
export default async function VinePage({ searchParams }: PageProps<"/vine">) {
  const sp = await searchParams;
  const mk = typeof sp.mk === "string" && MERCADOS.includes(sp.mk) ? sp.mk : MERCADOS[0];
  const info = marketplaceConocido(mk)!;
  const [{ pedidos: todos }, inscripciones, { productos }] = await Promise.all([datosVine(), inscripcionesVine(), listarProductos()]);
  const pedidos = todos.filter((p) => p.marketplaceId === mk);
  const unidades = pedidos.reduce((s, p) => s + p.unidades, 0);
  const conocidas = Object.fromEntries(productos.filter((p) => p.imagen).map((p) => [p.asin, p.imagen!]));
  const inscritas = (inscripciones.porMercado[mk] ?? []).map((f) => f.asin);
  const imagenes = { ...(await fotos(inscritas.filter((a) => !conocidas[a]), mk)), ...conocidas };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vine</h1>
        <p className="mt-1 text-sm text-ink-400">Tus productos en Amazon Vine y las unidades que Amazon entrega a los reseñadores, país por país.</p>
      </div>

      {/* Country */}
      <nav aria-label="País" className="flex flex-wrap gap-1.5">
        {MERCADOS.map((id) => {
          const m = marketplaceConocido(id)!;
          const activo = id === mk;
          const n = todos.filter((p) => p.marketplaceId === id).reduce((s, p) => s + p.unidades, 0);
          return (
            <Link
              key={id}
              href={id === MERCADOS[0] ? "/vine" : `/vine?mk=${id}`}
              scroll={false}
              aria-current={activo ? "page" : undefined}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${activo ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
            >
              <Bandera codigo={m.codigoPais} />
              {m.pais}
              {n > 0 && <span className="tabular text-xs text-ink-500">{n}</span>}
            </Link>
          );
        })}
      </nav>

      <TablaInscripciones key={mk} marketplaceId={mk} pais={info.pais} filas={inscripciones.porMercado[mk] ?? []} imagenes={imagenes} dominio={info.dominio.replace(/^www\./, "www.")} />

      {/* Units sent to Vine reviewers in this country */}
      <article className="min-w-0 overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
        <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-white" style={{ background: "#8b7cf6" }}>
          <h2 className="text-[15px] leading-tight font-semibold">Unidades enviadas a Vine · {info.pais}</h2>
          <span className="text-xs text-white/90">{formatNumero(unidades)} unidades</span>
        </header>
        {pedidos.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-400">No hay unidades de Vine en {info.pais} desde enero.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[620px] text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-xs text-ink-400">
                  <th className="py-2.5 pr-3 pl-4 font-medium">Fecha</th>
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
          Desde enero. Amazon no marca los pedidos de Vine: son los pedidos con descuento del 100 % (sin contar reemplazos). Tarifas «est.»: aún sin liquidar, con la logística FBA de ese país.
        </p>
      </article>
    </div>
  );
}
