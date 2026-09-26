import { cargarMarketplaces, cargarUltimaSync, syncEnCurso } from "@/lib/datos/panel";
import { datosVentas } from "@/lib/datos/almacen";
import { consumoDeHoy } from "@/lib/datos/consumo";
import { construirPanel, resolverPanel } from "@/lib/datos/tablero";
import { formatFechaHora } from "@/lib/format";
import { isAmazonConfigured } from "@/lib/amazon/cliente";
import { BotonSync } from "@/components/panel/BotonSync";
import { VistaPanel } from "@/components/panel/VistaPanel";

const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/*
 * Simplified phase 1: sales, orders and units only. The profit maths (fees,
 * VAT, cost, net profit) still runs in the sync and in cargarPanel; the
 * <Tarjetas>, <GraficoDiario> and <TablaProductos> components show it once
 * re-enabled.
 */
export default async function PanelPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const [marketplaces, ultimaSync, enCurso] = await Promise.all([cargarMarketplaces(), cargarUltimaSync(), syncEnCurso()]);

  const panel = resolverPanel(
    { p: texto(sp.p), e: texto(sp.e), desde: texto(sp.desde), hasta: texto(sp.hasta), pais: texto(sp.pais), mes: texto(sp.mes) },
    marketplaces.map((m) => m.id),
  );
  // ~3 Firestore reads per load: the sales data comes from the in-memory mirror (lib/datos/almacen.ts).
  const { lineas, reembolsos, imagenes } = await datosVentas(ultimaSync?.id ?? null);
  const consumo = await consumoDeHoy();
  const { tarjetas, productos, serie } = construirPanel(lineas, reembolsos, panel);

  return (
    <VistaPanel
      base="/"
      estado={panel.estado}
      hoy={panel.hoy}
      tarjetas={tarjetas}
      seleccionado={panel.seleccionado}
      serie={serie}
      consumo={consumo}
      productos={productos.map((p) => ({ ...p, imagen: imagenes.get(p.asin) ?? null }))}
      marketplaces={marketplaces}
      acciones={<BotonSync ultima={ultimaSync ? formatFechaHora(ultimaSync.fecha) : null} enCurso={enCurso} />}
      avisos={
        <>
          {!isAmazonConfigured && (
            <p className="rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
              Faltan las credenciales de Amazon en <code className="font-mono text-xs">.env.local</code> (SPAPI_LWA_CLIENT_ID, SPAPI_LWA_CLIENT_SECRET, SPAPI_REFRESH_TOKEN).
            </p>
          )}
          {isAmazonConfigured && !ultimaSync && !enCurso && (
            <p className="rounded-xl border border-white/[0.06] bg-ink-900/70 px-4 py-3 text-sm text-ink-300">
              Aún no hay datos. Pulsa <strong className="text-ink-100">Sincronizar ahora</strong> para traer los pedidos de Amazon.
            </p>
          )}
        </>
      }
    />
  );
}
