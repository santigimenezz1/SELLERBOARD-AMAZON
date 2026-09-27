export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap ${className}`}>
      {/* Rising bars: sales turning into profit. */}
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <rect x="4" y="15" width="5" height="9" rx="2" className="fill-accent-600" />
        <rect x="11.5" y="10" width="5" height="14" rx="2" className="fill-accent-500" />
        <rect x="19" y="4" width="5" height="20" rx="2" className="fill-accent-300" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight text-ink-100">
        Electronic<span className="text-ink-400"> VLC</span>
      </span>
    </span>
  );
}
