import { cargarMarketplaces } from "@/lib/datos/panel";
import { CATEGORIAS_POLITICAS, obtenerEstadoCuenta } from "@/lib/datos/estadoCuenta";
import { problemasNormativos } from "@/lib/datos/saludListings";
import { estadoNotificaciones } from "@/lib/datos/notificaciones";
import { VistaCuenta } from "@/components/cuenta/VistaCuenta";

const ES = "A1RKKUPIHCS9HS";

/** Account health per country: policy compliance and performance notifications. All from memory after the first load. */
export default async function CuentaPage() {
  const [marketplaces, estado, normativos, notificaciones] = await Promise.all([cargarMarketplaces(), obtenerEstadoCuenta(), problemasNormativos(), estadoNotificaciones()]);
  // Countries with a report, amazon.es first.
  const mercados = marketplaces
    .filter((m) => estado.porMercado[m.id])
    .sort((a, b) => (a.id === ES ? -1 : b.id === ES ? 1 : a.pais.localeCompare(b.pais, "es")))
    .map((m) => ({ id: m.id, pais: m.pais, codigoPais: m.codigoPais }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Estado de la cuenta</h1>
        <p className="mt-1 text-sm text-ink-400">Cumplimiento de políticas y notificaciones de performance de Amazon, país por país.</p>
      </div>
      {mercados.length === 0 ? (
        <p className="rounded-xl border border-white/[0.06] bg-ink-900/70 px-4 py-10 text-center text-sm text-ink-400">
          Aún no hay datos del estado de la cuenta. Se traen en la próxima sincronización.
        </p>
      ) : (
        <VistaCuenta
          mercados={mercados}
          estados={estado.porMercado}
          categorias={CATEGORIAS_POLITICAS}
          normativos={normativos}
          actualizadoEn={estado.actualizadoEn}
          notificaciones={notificaciones}
        />
      )}
    </div>
  );
}
