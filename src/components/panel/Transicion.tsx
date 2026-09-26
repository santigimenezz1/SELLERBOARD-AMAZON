"use client";

import { createContext, useContext, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Filters navigate inside a transition; while the new data loads, the panel
 * keeps its previous render dimmed instead of flashing a skeleton.
 */
const Ctx = createContext<{ pendiente: boolean; navegar: (url: string) => void }>({ pendiente: false, navegar: () => {} });

export function TransicionPanel({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const navegar = (url: string) => start(() => router.push(url, { scroll: false }));
  return <Ctx.Provider value={{ pendiente, navegar }}>{children}</Ctx.Provider>;
}

export const useNavegarPanel = () => useContext(Ctx);

export function Atenuable({ children }: { children: ReactNode }) {
  const { pendiente } = useContext(Ctx);
  return (
    <div aria-busy={pendiente} className={`transition-opacity duration-200 ${pendiente ? "pointer-events-none opacity-50" : ""}`}>
      {children}
    </div>
  );
}
