import { coloresProductoWallapop, listarEnviosWallapop } from "@/lib/datos/wallapop";
import { modoDemo } from "@/lib/auth/demo";
import { AvisoDemo } from "@/components/AvisoDemo";
import { VistaWallapop } from "@/components/wallapop/VistaWallapop";

/** Second-hand sales to hand over: one card per image (Vinted, Wallapop or Correos), pending until delivered. */
export default async function WallapopPage() {
  // A guest sees it empty: nothing of the owner's is loaded.
  const demo = await modoDemo();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Wallapop</h1>
        <p className="mt-1 text-sm text-ink-400">Sube las imágenes de tus envíos de Vinted, Wallapop y Correos. Cada una es una tarjeta pendiente hasta que la marques como entregada.</p>
      </div>
      {demo && <AvisoDemo />}
      <VistaWallapop envios={demo ? [] : await listarEnviosWallapop()} colores={demo ? {} : await coloresProductoWallapop()} soloLectura={demo} />
    </div>
  );
}
