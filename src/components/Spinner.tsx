/** Accessible loading spinner. Under prefers-reduced-motion it stays still (global CSS), the label still announces it. */
export function Spinner({ tamano = "md", etiqueta }: { tamano?: "sm" | "md" | "lg"; etiqueta?: string }) {
  const cls = { sm: "size-3.5 border-2", md: "size-5 border-2", lg: "size-9 border-[3px]" }[tamano];
  return (
    <span
      role={etiqueta ? "status" : undefined}
      aria-label={etiqueta}
      aria-hidden={etiqueta ? undefined : true}
      className={`inline-block shrink-0 animate-spin rounded-full border-white/15 border-t-accent-400 ${cls}`}
    />
  );
}
