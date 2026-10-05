import { requireUser } from "@/lib/auth/session";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { MenuMovil, Nav } from "@/components/Nav";
// import { ContadorConsumo } from "@/components/ContadorConsumo";
import { resumenEstadoCuenta } from "@/lib/datos/estadoCuenta";
import { RefrescoAutomatico } from "@/components/RefrescoAutomatico";
import { Chat } from "@/components/chat/Chat";

// Every page here depends on the signed-in user and live data: never pre-render them at build time. Without this
// the build tries to, and each attempt loads the whole order history from Firestore (thousands of reads per build
// or deploy) before giving up on the session cookie.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  // Colours the «Estado de la cuenta» menu item (from memory after the first load).
  const estadoCuenta = await resumenEstadoCuenta().catch(() => null);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-6">
              <Logo />
              <Nav estadoCuenta={estadoCuenta} />
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              {/* TEMPORARY: Firestore usage while testing the free-plan consumption. Hidden: next to the full menu it no
                  longer fits in the header (max 1280 px). Uncomment it and its import to show it again. */}
              {/* <ContadorConsumo /> */}
              <LogoutButton />
              {/* Phones only: a hamburger opens the menu. */}
              <MenuMovil estadoCuenta={estadoCuenta} email={user.email ?? null} />
            </div>
          </div>
          {/* Tablets: the full menu on its own row, when it doesn't fit next to the logo. */}
          <Nav estadoCuenta={estadoCuenta} fila />
        </div>
      </header>
      <RefrescoAutomatico />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      {/* «Pregunta a tu app»: the data chat, on every page. */}
      <Chat />
    </div>
  );
}
