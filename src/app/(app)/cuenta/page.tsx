import { cargarMarketplaces } from "@/lib/datos/panel";
import { CATEGORIAS_POLITICAS, obtenerEstadoCuenta, type ClaveCategoria, type EstadoMercado } from "@/lib/datos/estadoCuenta";
import type { EstadoNotificaciones } from "@/lib/datos/notificaciones";
import { problemasNormativos } from "@/lib/datos/saludListings";
import { estadoNotificaciones } from "@/lib/datos/notificaciones";
import { VistaCuenta } from "@/components/cuenta/VistaCuenta";
import { modoDemo } from "@/lib/auth/demo";
import { AvisoDemo } from "@/components/AvisoDemo";

const ES = "A1RKKUPIHCS9HS";

/** The demo: the five countries, with nothing reported. */
const MERCADOS_DEMO = [
  { id: ES, pais: "España", codigoPais: "ES" },
  { id: "A1PA6795UKMFR9", pais: "Alemania", codigoPais: "DE" },
  { id: "A13V1IB3VIYZZH", pais: "Francia", codigoPais: "FR" },
  { id: "APJ6JRA9NG5V4", pais: "Italia", codigoPais: "IT" },
  { id: "A1F83G8C2ARO7P", pais: "Reino Unido", codigoPais: "GB" },
];
const estadoVacio = (marketplaceId: string): EstadoMercado => ({
  marketplaceId,
  estado: null,
  puntuacion: null,
  estadoPuntuacion: null,
  categorias: Object.fromEntries(CATEGORIAS_POLITICAS.map((c) => [c.clave, 0])) as Record<ClaveCategoria, number>,
  avisos: 0,
  desde: null,
  hasta: null,
});

/** Account health per country: policy compliance and performance notifications. All from memory after the first load. */
export default async function CuentaPage() {
  // A guest sees it empty (no countries with a report): nothing of the owner's is loaded.
  const demo = await modoDemo();
  if (demo)
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estado de la cuenta</h1>
          <p className="mt-1 text-sm text-ink-400">Cumplimiento de políticas y notificaciones de performance de Amazon, país por país.</p>
        </div>
        <AvisoDemo />
        <VistaCuenta
          mercados={MERCADOS_DEMO}
          estados={Object.fromEntries(MERCADOS_DEMO.map((m) => [m.id, estadoVacio(m.id)]))}
          categorias={CATEGORIAS_POLITICAS}
          normativos={{}}
          actualizadoEn={null}
          notificaciones={{ configurado: false, conectado: false, email: null, actualizadoEn: null, notificaciones: [] } as unknown as EstadoNotificaciones}
        />
      </div>
    );
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
