"use client";

import { FlaskConical, GitBranch, LayoutDashboard, ListChecks, LogOut, PlayCircle, ShieldCheck, UserCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "./ui";

const LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/my", label: "Meus testes", icon: UserCheck },
  { href: "/plans", label: "Planos", icon: ListChecks },
  { href: "/runs", label: "Runs", icon: PlayCircle },
  { href: "/traceability", label: "Rastreabilidade", icon: GitBranch },
];

export function AppNav({ username, mock, isAdmin, scope }: { username: string; mock: boolean; isAdmin: boolean; scope: "all" | "mine" }) {
  const pathname = usePathname();
  const router = useRouter();

  /** Admin alterna entre ver tudo e ver só o que é dele (cookie qahub_scope). */
  async function setScope(next: "all" | "mine") {
    if (next === scope) return;
    await fetch("/api/scope", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: next }) });
    router.refresh();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <Link href="/" className="mr-2 flex items-center gap-2 font-semibold">
          <FlaskConical className="size-5 text-accent" aria-hidden />
          <span className="hidden sm:inline">QA Hub</span>
        </Link>
        <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 text-sm text-fg-2 transition hover:bg-surface-2 hover:text-fg",
                  active && "bg-surface-2 font-medium text-fg",
                )}
              >
                <Icon className="size-4" aria-hidden />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        {mock && <span className="hidden rounded-md bg-blocked/15 px-2 py-0.5 text-xs font-medium text-fg-2 sm:inline">dados de exemplo</span>}
        {isAdmin && (
          <div className="flex rounded-lg border border-border p-0.5 text-xs" role="group" aria-label="O que ver">
            {(
              [
                ["all", "Tudo"],
                ["mine", "Só os meus"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setScope(value)}
                aria-pressed={scope === value}
                className={cn("rounded-md px-2 py-1 font-medium", scope === value ? "bg-surface-2 text-fg" : "text-muted hover:text-fg")}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <span className="hidden items-center gap-1.5 text-sm text-fg-2 lg:inline-flex">
          {username}
          {isAdmin && (
            <span className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-1.5 py-0.5 text-[11px] font-semibold text-accent">
              <ShieldCheck className="size-3" aria-hidden /> Admin
            </span>
          )}
        </span>
        <button onClick={logout} className="flex size-9 items-center justify-center rounded-lg text-fg-2 hover:bg-surface-2" title="Sair" aria-label="Sair">
          <LogOut className="size-4" />
        </button>
      </div>
    </header>
  );
}
