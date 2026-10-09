/** A stand-in for a listing photo while the real ones aren't loaded: a bottle outline on a soft background, with its slot. */
export function FotoGenerica({ n, tipo, tono = 0, className = "" }: { n?: number; tipo?: string; tono?: number; className?: string }) {
  const fondos = ["from-sky-200 to-sky-50", "from-emerald-200 to-emerald-50", "from-amber-200 to-amber-50", "from-rose-200 to-rose-50", "from-violet-200 to-violet-50", "from-slate-300 to-slate-100"];
  return (
    <div className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br ${fondos[Math.abs(tono) % fondos.length]} ${className}`}>
      <svg viewBox="0 0 40 100" aria-hidden className="h-3/4 text-slate-500/70" fill="currentColor">
        <rect x="13" y="2" width="14" height="10" rx="3" />
        <rect x="11" y="11" width="18" height="6" rx="2" opacity="0.8" />
        <rect x="7" y="17" width="26" height="80" rx="9" />
        <rect x="10" y="30" width="4" height="50" rx="2" fill="white" opacity="0.35" />
      </svg>
      {(n !== undefined || tipo) && (
        <span className="absolute inset-x-1.5 bottom-1.5 truncate rounded bg-black/55 px-1.5 py-0.5 text-center text-[10px] font-medium text-white">
          {n !== undefined ? `${n}. ` : ""}
          {tipo}
        </span>
      )}
    </div>
  );
}
