import { requireUser } from "@/lib/auth/session";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { Nav } from "@/components/Nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Logo />
            <Nav />
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[220px] truncate text-sm text-ink-400 md:block">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
