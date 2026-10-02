import Link from "next/link";
import { obtenerMensajes } from "@/lib/datos/mensajes";
import { asegurarAlmacen, pedidosEnAlmacen } from "@/lib/datos/almacen";
import { idUltimaSync } from "@/lib/datos/panel";
import { marketplaceConocido, marketplacePorNombre } from "@/lib/datos/marketplacesConocidos";
import { ETIQUETAS_POR_ASIN } from "@/lib/datos/etiquetas";
import { Bandera } from "@/components/Bandera";

const fechaHora = (f: string) => new Date(f).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

/** Buyer messages, newest first, by country: what the customer wrote, about which order and product. */
export default async function MensajesPage({ searchParams }: PageProps<"/mensajes">) {
  const sp = await searchParams;
  const [{ lista, actualizadoEn }] = await Promise.all([obtenerMensajes(), asegurarAlmacen(await idUltimaSync())]);
  const pedidos = new Map([...pedidosEnAlmacen().values()].map((p) => [p.amazonOrderId, p]));

  const mensajes = lista.map((m) => {
    const id = m.marketplaceId ?? marketplacePorNombre(m.dominio);
    const mk = id ? marketplaceConocido(id) : null;
    const pedido = m.pedido ? pedidos.get(m.pedido) : undefined;
    const asin = m.asin ?? pedido?.asin ?? null;
    return { ...m, mkId: id, pais: mk?.pais ?? m.dominio, codigoPais: mk?.codigoPais ?? "", etiqueta: asin ? (ETIQUETAS_POR_ASIN[asin] ?? null) : null, sku: pedido?.sku ?? null };
  });
  const paises = [...new Map(mensajes.filter((m) => m.mkId).map((m) => [m.mkId!, { id: m.mkId!, pais: m.pais, codigoPais: m.codigoPais }])).values()].sort((a, b) => a.pais.localeCompare(b.pais, "es"));
  const elegido = typeof sp.mk === "string" && paises.some((p) => p.id === sp.mk) ? sp.mk : null;
  const visibles = elegido ? mensajes.filter((m) => m.mkId === elegido) : mensajes;

  const chip = (activo: boolean) =>
    `inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${activo ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mensajes</h1>
        <p className="mt-1 text-sm text-ink-400">Lo que te escriben los clientes, país por país. Amazon pide responder en menos de 24 horas.</p>
      </div>

      <nav aria-label="País" className="flex flex-wrap gap-1.5">
        <Link href="/mensajes" scroll={false} className={chip(elegido === null)}>
          Todos los países <span className="tabular text-xs text-ink-500">{mensajes.length}</span>
        </Link>
        {paises.map((p) => (
          <Link key={p.id} href={`/mensajes?mk=${p.id}`} scroll={false} className={chip(elegido === p.id)}>
            <Bandera codigo={p.codigoPais} />
            {p.pais}
            <span className="tabular text-xs text-ink-500">{mensajes.filter((m) => m.mkId === p.id).length}</span>
          </Link>
        ))}
      </nav>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-white/[0.06] bg-ink-900/70 px-4 py-10 text-center text-sm text-ink-400">
          No hay mensajes de clientes. Llegan del correo conectado: comprueba en Seller Central → Configuración → Preferencias de notificación → Mensajes que los «Mensajes de compradores» vayan a ese correo.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {visibles.map((m) => (
            <li key={m.id}>
              <article className="overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
                <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-white" style={{ background: "#2c90b6" }}>
                  <h2 className="flex items-center gap-2 text-[15px] leading-tight font-semibold">
                    {m.codigoPais && <Bandera codigo={m.codigoPais} />}
                    {m.pais}
                    <span className="text-xs font-normal text-white/80">· {fechaHora(m.fecha)}</span>
                  </h2>
                  {m.pedido && <span className="font-mono text-xs text-white/90">Pedido {m.pedido}</span>}
                </header>
                <div className="flex flex-col gap-3 px-4 py-3">
                  <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
                    {m.cliente && (
                      <>
                        <dt className="text-ink-400">Cliente</dt>
                        <dd className="text-ink-100">{m.cliente}</dd>
                      </>
                    )}
                    {m.producto && (
                      <>
                        <dt className="text-ink-400">Producto</dt>
                        <dd className="min-w-0 text-ink-100">
                          {m.etiqueta && <span className="mr-1.5 rounded bg-success/10 px-1 py-px text-[10px] font-semibold tracking-wide text-success">{m.etiqueta}</span>}
                          <span className="text-ink-300">{m.producto}</span>
                          {m.asin && <span className="ml-1.5 font-mono text-[11px] text-ink-500">{m.asin}</span>}
                        </dd>
                      </>
                    )}
                    <dt className="text-ink-400">Asunto</dt>
                    <dd className="text-ink-300">{m.asunto}</dd>
                  </dl>
                  <p className="rounded-lg border border-white/[0.06] bg-ink-950/50 px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-ink-100">{m.texto || "(sin texto)"}</p>
                </div>
                <div className="flex justify-end border-t border-white/[0.08] bg-white/[0.03] px-4 py-2.5">
                  <a href={`https://sellercentral.${m.dominio || "amazon.es"}/messaging/inbox`} target="_blank" rel="noopener" className="text-xs font-medium text-accent-400 hover:text-accent-300">
                    Responder en Seller Central →
                  </a>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      {actualizadoEn && <p className="text-xs text-ink-500">Comprobado: {fechaHora(actualizadoEn)} · se revisa en cada sincronización completa (cada hora).</p>}
    </div>
  );
}
