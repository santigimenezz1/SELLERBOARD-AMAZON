import Link from "next/link";

/** On top of an owner's section seen by a guest: it's a demo with no data; «Análisis H10» is the part they can use. */
export function AvisoDemo() {
  return (
    <p className="rounded-xl border border-accent-500/30 bg-accent-500/[0.07] px-4 py-3 text-sm text-ink-200">
      <strong className="text-accent-300">Cuenta de demostración:</strong> este apartado se ve vacío, sin datos. Lo que puedes usar entero es{" "}
      <Link href="/analisis-h10" className="font-semibold text-accent-300 underline-offset-4 hover:underline">
        Análisis H10
      </Link>
      .
    </p>
  );
}
