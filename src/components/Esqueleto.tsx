/**
 * The shape of a page while its data arrives (the route's loading.tsx): a title, a subtitle and a few cards that
 * pulse softly. Shown at once on every navigation, so changing section never looks frozen.
 */
export function Esqueleto({ tarjetas = 6, pestanas = false }: { tarjetas?: number; pestanas?: boolean }) {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Cargando">
      <div className="flex flex-col gap-2">
        <span className="h-7 w-56 rounded-lg bg-white/[0.06]" />
        <span className="h-4 w-full max-w-md rounded-md bg-white/[0.04]" />
      </div>
      {pestanas && (
        <div className="flex gap-2 border-b border-white/[0.06] pb-2">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="h-7 w-20 rounded-md bg-white/[0.04]" />
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: tarjetas }, (_, i) => (
          <div key={i} className="flex h-32 flex-col gap-3 rounded-xl border border-white/[0.06] bg-ink-900/60 p-4">
            <span className="h-3 w-24 rounded bg-white/[0.06]" />
            <span className="h-6 w-32 rounded-md bg-white/[0.08]" />
            <span className="mt-auto h-3 w-40 rounded bg-white/[0.04]" />
          </div>
        ))}
      </div>
      <div className="h-64 rounded-xl border border-white/[0.06] bg-ink-900/60" />
    </div>
  );
}
