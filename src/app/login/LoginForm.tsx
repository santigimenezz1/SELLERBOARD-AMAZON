"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { clientAuth, isFirebaseConfigured } from "@/lib/firebase/client";

const AUTH_ERRORS: Record<string, string> = {
  "auth/invalid-credential": "Email o contraseña incorrectos.",
  "auth/invalid-email": "El email no tiene un formato válido.",
  "auth/user-disabled": "Esta cuenta está desactivada.",
  "auth/too-many-requests": "Demasiados intentos. Espera unos minutos y vuelve a probar.",
  "auth/network-request-failed": "Sin conexión. Revisa tu red.",
};

export function LoginForm({ serverConfigured }: { serverConfigured: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const configured = isFirebaseConfigured && serverConfigured;

  // Reaching /login means there is no valid server session; drop any stale client session too.
  useEffect(() => {
    if (isFirebaseConfigured) signOut(clientAuth()).catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const cred = await signInWithEmailAndPassword(clientAuth(), email.trim(), password);
      const idToken = await cred.user.getIdToken();
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "No se pudo iniciar la sesión.");
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof FirebaseError
          ? (AUTH_ERRORS[err.code] ?? "No se pudo iniciar sesión. Inténtalo de nuevo.")
          : err instanceof Error
            ? err.message
            : "Error inesperado.",
      );
      setPending(false);
    }
  }

  if (!configured) {
    return (
      <div className="text-sm leading-relaxed text-ink-300">
        <p className="font-medium text-warning">Falta la configuración de Firebase</p>
        <p className="mt-2">
          Copia <code className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-xs">.env.example</code> como{" "}
          <code className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-xs">.env.local</code>, rellena los valores
          {!isFirebaseConfigured && " de cliente (NEXT_PUBLIC_FIREBASE_*)"}
          {!serverConfigured && " de administrador (FIREBASE_ADMIN_*)"} y reinicia el servidor.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="Email" htmlFor="email">
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          placeholder="tu@email.com"
        />
      </Field>

      <Field label="Contraseña" htmlFor="password">
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          placeholder="••••••••"
        />
      </Field>

      {error && (
        <p role="alert" className="animate-fade-up rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !email || !password}
        className="group relative flex h-11 w-full items-center justify-center rounded-xl bg-accent-500 text-[15px] font-medium text-ink-950 transition-all duration-200 hover:bg-accent-400 hover:shadow-glow active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent-500 disabled:hover:shadow-none"
      >
        {pending ? (
          <span className="size-4 animate-spin rounded-full border-2 border-ink-950/30 border-t-ink-950" aria-label="Entrando" />
        ) : (
          <>
            Entrar
            <span className="ml-1.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>
              →
            </span>
          </>
        )}
      </button>
    </form>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-white/[0.08] bg-ink-950/60 px-3.5 text-[15px] text-ink-100 placeholder:text-ink-600 outline-none transition-colors duration-200 hover:border-white/[0.14] focus:border-accent-500/70 focus:ring-4 focus:ring-accent-500/15";

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-ink-300">
        {label}
      </label>
      {children}
    </div>
  );
}
