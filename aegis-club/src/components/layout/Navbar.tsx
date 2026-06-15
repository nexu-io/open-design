import Link from "next/link";
import { Shield, LogOut } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { Avatar } from "@/components/ui/Avatar";
import { buttonVariants } from "@/components/ui/Button";
import { NavLinks } from "@/components/layout/NavLinks";
import { cn } from "@/lib/utils";

export async function Navbar() {
  const user = await getCurrentUser();
  const devLogin = process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === "true";

  return (
    <header className="sticky top-0 z-40 border-b border-surface-border bg-bg/80 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-aegis" />
            <span className="font-display text-lg font-extrabold tracking-tight text-zinc-100">
              AEGIS<span className="text-aegis">CLUB</span>
            </span>
          </Link>
          <NavLinks />
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link
                href={`/profile/${user.id}`}
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-hover"
              >
                <Avatar src={user.avatarUrl} name={user.nickname} size="sm" />
                <span className="hidden text-sm font-medium text-zinc-200 sm:block">
                  {user.nickname}
                </span>
              </Link>
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-surface-hover hover:text-dire-soft"
                  title="Sair"
                  aria-label="Sair"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </>
          ) : (
            <>
              {devLogin && (
                <Link
                  href="/api/auth/dev"
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                >
                  Login de teste
                </Link>
              )}
              <Link
                href="/api/auth/steam/login"
                className={cn(buttonVariants({ variant: "primary", size: "sm" }))}
              >
                Entrar com Steam
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
