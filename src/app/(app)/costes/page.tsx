import { listarSkus } from "@/lib/datos/costes";
import { EditorCostes } from "@/components/costes/EditorCostes";

export default async function CostesPage() {
  const skus = await listarSkus();
  const sinCoste = skus.filter((s) => s.costeUnitario === null).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Costes de producto</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-400">
          Lo que te cuesta producir o comprar una unidad de cada SKU. Se aplica a los pedidos que se sincronicen a partir de ahora y a los que aún no tenían coste; los
          pedidos que ya tenían un coste lo conservan.
        </p>
      </div>
      {skus.length === 0 ? (
        <p className="rounded-xl border border-white/[0.06] bg-ink-900/70 px-4 py-10 text-center text-sm text-ink-400">
          Todavía no hay SKUs: aparecerán aquí después de la primera sincronización con Amazon.
        </p>
      ) : (
        <EditorCostes skus={skus} sinCoste={sinCoste} />
      )}
    </div>
  );
}
