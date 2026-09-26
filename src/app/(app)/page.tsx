import { cargarMarketplaces, cargarPanel, cargarUltimaSync } from "@/lib/datos/panel";
import { resolverRango, RANGOS } from "@/lib/datos/fechas";
import { formatDiaLargo, formatFechaHora } from "@/lib/format";
import { isAmazonConfigured } from "@/lib/amazon/cliente";
import { Filtros } from "@/components/panel/Filtros";
import { BotonSync } from "@/components/panel/BotonSync";
import { Tarjetas } from "@/components/panel/Tarjetas";
import { GraficoDiario } from "@/components/panel/GraficoDiario";
import { TablaProductos } from "@/components/panel/TablaProductos";
import { Atenuable, TransicionPanel } from "@/components/panel/Transicion";

const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function PanelPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const { rango, desde, hasta } = resolverRango(texto(sp.rango), texto(sp.desde), texto(sp.hasta));

  const [marketplaces, ultimaSync] = await Promise.all([cargarMarketplaces(), cargarUltimaSync()]);
  const paisPedido = texto(sp.pais) ?? null;
  const pais = marketplaces.some((m) => m.id === paisPedido) ? paisPedido : null;
  const datos = await cargarPanel(desde, hasta, pais);

  const subtitulo = desde === hasta ? formatDiaLargo(desde) : `${formatDiaLargo(desde)} – ${formatDiaLargo(hasta)}`;

  return (
    <TransicionPanel>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Panel de beneficio</h1>
            <p className="mt-1 text-sm text-ink-400">
              {rango === "personalizado" ? subtitulo : `${RANGOS[rango]} · ${subtitulo}`} · importes en EUR
            </p>
          </div>
          <BotonSync ultima={ultimaSync ? formatFechaHora(ultimaSync.fecha) : null} />
        </div>

        {!isAmazonConfigured && (
          <p className="rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
            Faltan las credenciales de Amazon en <code className="font-mono text-xs">.env.local</code> (SPAPI_LWA_CLIENT_ID, SPAPI_LWA_CLIENT_SECRET, SPAPI_REFRESH_TOKEN).
          </p>
        )}
        {isAmazonConfigured && !ultimaSync && (
          <p className="rounded-xl border border-white/[0.06] bg-ink-900/70 px-4 py-3 text-sm text-ink-300">
            Aún no hay datos. Pulsa <strong className="text-ink-100">Sincronizar ahora</strong> para traer los pedidos de Amazon.
          </p>
        )}

        <Filtros key={`${rango}-${desde}-${hasta}`} rango={rango} desde={desde} hasta={hasta} pais={pais} marketplaces={marketplaces} />

        <Atenuable>
          <div className="flex flex-col gap-6">
            <Tarjetas m={datos.metricas} />
            <GraficoDiario serie={datos.serie} />
            <TablaProductos productos={datos.productos} />
          </div>
        </Atenuable>
      </div>
    </TransicionPanel>
  );
}
