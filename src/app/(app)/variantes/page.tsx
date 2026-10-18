import { listarTableros } from "@/lib/datos/variantes";
import { listarProductos } from "@/lib/datos/productos";
import { VistaVariantes } from "@/components/variantes/VistaVariantes";
import { modoDemo } from "@/lib/auth/demo";
import { AvisoDemo } from "@/components/AvisoDemo";

/** Test section: boards where a product and its components are laid out as images joined by arrows. */
export default async function VariantesPage() {
  // A guest sees it empty: nothing of the owner's is loaded.
  const demo = await modoDemo();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-2xl font-semibold tracking-tight">Variantes</h1>
        <p className="text-sm text-ink-400">El producto y sus componentes, unidos con flechas, con lo que lleva cada uno.</p>
      </div>
      {demo && <AvisoDemo />}
      <VistaVariantes
        tableros={demo ? [] : await listarTableros()}
        // Your listings, to import one with its variants (active ones first).
        productos={(demo ? { productos: [] } : await listarProductos().catch(() => ({ productos: [] }))).productos
          .sort((a, b) => Number(b.activo) - Number(a.activo))
          .map((p) => ({ asin: p.asin, titulo: p.titulo }))}
      />
    </div>
  );
}
