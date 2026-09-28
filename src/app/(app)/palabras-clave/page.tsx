import Link from "next/link";
import { listarProductos } from "@/lib/datos/productos";
import { ETIQUETAS_POR_ASIN } from "@/lib/datos/etiquetas";
import { DATOS_DE_EJEMPLO, rendimientoBusqueda } from "@/lib/datos/palabrasClave";
import { formatNumero } from "@/lib/format";

const porcentaje = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")} %`;

/** One card per listing with its search figures of the week; the detail opens on click. */
export default async function PalabrasClavePage() {
  const { productos } = await listarProductos();
  const listings = productos.filter((p) => ETIQUETAS_POR_ASIN[p.asin]);
  const datos = await Promise.all(listings.map((p) => rendimientoBusqueda(p.asin, ETIQUETAS_POR_ASIN[p.asin] === "LISTING NUEVO")));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Palabras clave</h1>
        <p className="mt-1 text-sm text-ink-400">Cómo te encuentran en el buscador de Amazon: por qué búsquedas llegan los clientes y qué parte se lleva tu listing.</p>
      </div>

      {DATOS_DE_EJEMPLO && (
        <p className="rounded-xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning">
          <strong>Datos de ejemplo.</strong> Se sustituirán por los reales de Amazon (Brand Analytics) cuando Amazon apruebe el permiso de la app.
        </p>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {listings.map((p, i) => {
          const mercados = datos[i];
          const imp = mercados.reduce((s, m) => s + m.catalogo.impresiones, 0);
          const clics = mercados.reduce((s, m) => s + m.catalogo.clics, 0);
          const compras = mercados.reduce((s, m) => s + m.catalogo.compras, 0);
          const es = mercados[0];
          const principal = es.consultas[0];
          return (
            <li key={p.asin}>
              <Link href={`/palabras-clave/${p.asin}`} className="group flex h-full gap-3 rounded-xl border border-white/[0.06] bg-ink-900/70 p-3 transition-colors hover:border-white/[0.16] hover:bg-ink-900">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
                  {p.imagen ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imagen} alt="" loading="lazy" className="size-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-ink-600">Sin foto</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate font-mono text-[11px] text-ink-400">
                    {p.skus.join(", ") || p.asin}
                    <span className="ml-1.5 rounded bg-success/10 px-1 py-px font-sans text-[10px] font-semibold tracking-wide text-success">{ETIQUETAS_POR_ASIN[p.asin]}</span>
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-[13px] leading-snug text-ink-100 group-hover:text-accent-300">{p.titulo}</p>
                  <dl className="tabular mt-2 grid grid-cols-3 gap-2 text-[11px] text-ink-400">
                    <div>
                      <dt>Impresiones</dt>
                      <dd className="text-sm font-semibold text-ink-100">{formatNumero(imp)}</dd>
                    </div>
                    <div>
                      <dt>Clics</dt>
                      <dd className="text-sm font-semibold text-ink-100">{formatNumero(clics)}</dd>
                    </div>
                    <div>
                      <dt>Compras</dt>
                      <dd className="text-sm font-semibold text-ink-100">{formatNumero(compras)}</dd>
                    </div>
                  </dl>
                  {principal && (
                    <p className="mt-2 truncate text-[11px] text-ink-400">
                      🇪🇸 «{principal.busqueda}»: <span className="font-semibold text-ink-100">{porcentaje(principal.tuyo.impresiones / principal.total.impresiones)}</span> de las impresiones
                    </p>
                  )}
                  <p className="mt-auto pt-2 text-right text-[11px] text-accent-400 group-hover:text-accent-300">Ver detalle por país →</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-ink-500">Semana del 20 al 26 de septiembre · todos los países.</p>
    </div>
  );
}
