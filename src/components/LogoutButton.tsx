"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { clientAuth } from "@/lib/firebase/client";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await fetch("/api/session", { method: "DELETE" }).catch(() => {});
    await signOut(clientAuth()).catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      disabled={pending}
      className="h-9 rounded-lg border border-white/[0.08] px-3.5 text-sm text-ink-300 transition-all duration-200 hover:border-white/[0.16] hover:bg-white/[0.04] hover:text-ink-100 active:scale-[0.97] disabled:opacity-50"
    >
      {pending ? "Saliendo…" : "Cerrar sesión"}
    </button>
  );
}
