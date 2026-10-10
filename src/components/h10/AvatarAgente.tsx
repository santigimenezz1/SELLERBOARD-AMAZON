import type { MiembroEquipo } from "@/lib/datos/h10Equipo";

/** A flat illustrated portrait of a team member: head, hair, shoulders and shirt on their colour. */
export function AvatarAgente({ avatar, tamano = 64, trabajando = false }: { avatar: MiembroEquipo["avatar"]; tamano?: number; trabajando?: boolean }) {
  const { fondo, camisa, pelo, piel, peinado } = avatar;
  return (
    <span className="relative inline-flex shrink-0">
      <svg viewBox="0 0 64 64" width={tamano} height={tamano} aria-hidden className="rounded-2xl">
        <defs>
          <linearGradient id={`f-${fondo}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={fondo} />
            <stop offset="1" stopColor={fondo} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill={`url(#f-${fondo})`} />
        {/* Long hair goes behind the head */}
        {peinado === "largo" && <path d="M17 30c0-12 7-19 15-19s15 7 15 19v18H17z" fill={pelo} />}
        {/* Shoulders and shirt */}
        <path d="M10 64c1-11 10-17 22-17s21 6 22 17z" fill={camisa} />
        <path d="M27 47h10l-5 7z" fill={piel} opacity="0.9" />
        {/* Neck and head */}
        <rect x="28" y="38" width="8" height="10" rx="3" fill={piel} />
        <ellipse cx="32" cy="29" rx="11" ry="12.5" fill={piel} />
        {/* Hair on top */}
        {peinado === "corto" && <path d="M21 27c0-9 5-14 11-14s11 5 11 13c-3-4-7-6-11-6s-8 2-11 7z" fill={pelo} />}
        {peinado === "largo" && <path d="M21 27c0-9 5-14 11-14s11 5 11 14c-4-5-8-7-13-7-3 0-6 2-9 7z" fill={pelo} />}
        {peinado === "mono" && (
          <>
            <circle cx="32" cy="12" r="5" fill={pelo} />
            <path d="M21 27c0-9 5-13 11-13s11 4 11 13c-3-5-7-7-11-7s-8 2-11 7z" fill={pelo} />
          </>
        )}
        {peinado === "rizado" && <path d="M20 26c-2-8 4-15 12-15 9 0 14 7 12 15-1-3-3-5-5-5-1 2-4 3-7 3s-6-1-7-3c-2 0-4 2-5 5z" fill={pelo} />}
        {peinado === "rapado" && <path d="M22 24c1-7 5-10 10-10s9 3 10 10c-3-3-6-4-10-4s-7 1-10 4z" fill={pelo} />}
        {/* Face */}
        <circle cx="28" cy="30" r="1.3" fill="#1c1917" />
        <circle cx="36" cy="30" r="1.3" fill="#1c1917" />
        <path d="M28.5 35.5c2 1.6 5 1.6 7 0" stroke="#1c1917" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </svg>
      {trabajando && <span className="absolute -right-1 -bottom-1 size-3.5 animate-pulse rounded-full border-2 border-ink-900 bg-success" title="Trabajando" />}
    </span>
  );
}
