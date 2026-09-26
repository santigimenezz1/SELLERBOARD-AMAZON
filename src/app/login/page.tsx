import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { isAdminConfigured } from "@/lib/firebase/admin";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");

  return (
    <main className="relative flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-[400px] animate-fade-up">
        <Logo className="mb-10" />
        <h1 className="text-3xl font-semibold tracking-tight text-ink-100">Beneficios en Amazon</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-400">Panel privado de la tienda. Inicia sesión con tu cuenta.</p>
        <div className="mt-8 rounded-2xl border border-white/[0.06] bg-ink-900/80 p-6 shadow-soft backdrop-blur sm:p-7">
          <LoginForm serverConfigured={isAdminConfigured} />
        </div>
        <p className="mt-6 text-center text-xs text-ink-400/70">Acceso restringido · sin registro público</p>
      </div>
    </main>
  );
}
