import { createContext, ReactNode, useContext, useState } from 'react';

/**
 * Sesión de ejemplo: guarda el usuario en memoria.
 * Más adelante se reemplaza por un backend real (Firebase, Supabase, API propia...).
 */
type Usuario = { nombre: string; email: string };

type Sesion = {
  usuario: Usuario | null;
  entrar: (email: string) => void;
  registrarse: (nombre: string, email: string) => void;
  salir: () => void;
};

const SesionContext = createContext<Sesion | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  const valor: Sesion = {
    usuario,
    entrar: (email) => setUsuario({ nombre: email.split('@')[0] || 'Usuario', email }),
    registrarse: (nombre, email) => setUsuario({ nombre, email }),
    salir: () => setUsuario(null),
  };

  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>;
}

export function useSesion() {
  const ctx = useContext(SesionContext);
  if (!ctx) throw new Error('useSesion debe usarse dentro de <SesionProvider>');
  return ctx;
}
