import { cargarMarketplaces, cargarPanel, cargarUltimaSync, productosVendidos } from "@/lib/datos/panel";
import { resolverRango, RANGOS } from "@/lib/datos/fechas";
import { formatDiaLargo, formatFechaHora } from "@/lib/format";
import { isAmazonConfigured } from "@/lib/amazon/cliente";
import { Filtros } from "@/components/panel/Filtros";
import { BotonSync } from "@/components/panel/BotonSync";
import { TarjetasVentas } from "@/components/panel/TarjetasVentas";
import { TablaVendidos } from "@/components/panel/TablaVendidos";
import { Atenuable, TransicionPanel } from "@/components/panel/Transicion";

const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function PanelPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const { rango, desde, hasta } = resolverRango(texto(sp.rango), texto(sp.desde), texto(sp.hasta));

  const [marketplaces, ultimaSync] = await Promise.all([cargarMarketplaces(), cargarUltimaSync()]);
  const paisPedido = texto(sp.pais) ?? null;
  const pais = marketplaces.some((m) => m.id === paisPedido) ? paisPedido : null;
  const datos = await cargarPanel(desde, hasta, pais);
  const vendidos = await productosVendidos(datos.productos, marketplaces);
  const mercado = marketplaces.find((m) => m.id === pais);

  const subtitulo = desde === hasta ? formatDiaLargo(desde) : `${formatDiaLargo(desde)} – ${formatDiaLargo(hasta)}`;

  return (
    <TransicionPanel>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Ventas {mercado ? `· ${mercado.pais}` : "internacionales"}</h1>
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
            {/* Simplified phase 1: sales and units only. The profit maths (fees, VAT, cost, net profit) still runs in
                cargarPanel and the sync; <Tarjetas>, <GraficoDiario> and <TablaProductos> show it once re-enabled. */}
            <TarjetasVentas m={datos.metricas} />
            <TablaVendidos productos={vendidos} desglosePorPais={!pais} dominio={mercado?.dominio.replace(/^https?:\/\//, "") || "www.amazon.es"} />
          </div>
        </Atenuable>
      </div>
    </TransicionPanel>
  );
}
