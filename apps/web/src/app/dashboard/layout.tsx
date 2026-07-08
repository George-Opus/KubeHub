"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes,
  ChevronDown,
  Database,
  LayoutGrid,
  LogOut,
  Network,
  ScrollText,
  Server,
  Settings2,
  Layers,
} from "lucide-react";
import { KubeHubLogo } from "@/components/KubeHubLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ClusterProvider, useClusters } from "@/components/ClusterContext";
import { api, type User } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Vue d'ensemble", icon: LayoutGrid, exact: true },
  { href: "/dashboard/workloads", label: "Workloads", icon: Boxes },
  { href: "/dashboard/config", label: "Configuration", icon: Settings2 },
  { href: "/dashboard/network", label: "Réseau", icon: Network },
  { href: "/dashboard/storage", label: "Stockage", icon: Database },
  { href: "/dashboard/nodes", label: "Nodes", icon: Server },
  { href: "/dashboard/namespaces", label: "Namespaces", icon: Layers },
  { href: "/dashboard/events", label: "Events", icon: ScrollText },
  { href: "/dashboard/clusters", label: "Clusters", icon: Boxes },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    api.me(token).then(setUser).catch(() => {
      clearToken();
      router.replace("/login");
    });
  }, [router]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background font-mono">
        <span className="text-primary cursor-blink text-sm">booting</span>
      </div>
    );
  }

  return (
    <ClusterProvider>
      <Shell user={user} onLogout={() => { clearToken(); router.replace("/login"); }}>
        {children}
      </Shell>
    </ClusterProvider>
  );
}

function Shell({
  user,
  onLogout,
  children,
}: {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";

  return (
    <div className="flex h-screen overflow-hidden bg-background font-mono text-sm text-foreground">
      <aside className="sticky top-0 z-30 flex h-screen w-14 shrink-0 flex-col items-center border-r border-border/60 bg-[hsl(var(--sidebar))] py-3">
        <Link href="/dashboard" className="mb-4 flex h-10 w-10 items-center justify-center text-primary" title="KubeHub">
          <KubeHubLogo size="sm" framed />
        </Link>
        <nav className="flex flex-1 flex-col items-center gap-1">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/") || pathname === href;
            return (
              <Link key={href} href={href} title={label} className={`rail-link ${active ? "rail-link-active" : ""}`}>
                {active && <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-primary" />}
                <Icon className="h-[18px] w-[18px]" />
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-11 items-center justify-between gap-3 border-b border-border/60 bg-background/95 px-4 text-xs backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="hidden text-primary sm:inline">kubehub</span>
            <ClusterSwitcher />
            <NamespaceSwitcher />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="hidden sm:inline">
              <span className="text-primary">{user.username}</span>@kubehub
            </span>
            <ThemeToggle />
            <button type="button" onClick={onLogout} className="btn-icon" title="Déconnexion">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden px-4 py-4">
          <div className="mx-auto flex h-full max-w-[1500px] flex-col">{children}</div>
        </main>
      </div>
    </div>
  );
}

function ClusterSwitcher() {
  const { clusters, activeCluster, setActiveCluster } = useClusters();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-primary/50"
      >
        <span className={`h-2 w-2 rounded-full ${dot(activeCluster?.status)}`} />
        <span className="max-w-[160px] truncate">{activeCluster?.name ?? "Aucun cluster"}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-64 overflow-auto rounded-lg border border-border bg-card p-1 shadow-xl">
            {clusters.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">Aucun cluster enregistré.</p>
            )}
            {clusters.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setActiveCluster(c.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-accent ${
                  activeCluster?.id === c.id ? "text-primary" : "text-foreground"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${dot(c.status)}`} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {c.server_url && <span className="truncate text-[10px] text-muted-foreground">{c.status}</span>}
              </button>
            ))}
            <Link
              href="/dashboard/clusters"
              onClick={() => setOpen(false)}
              className="mt-1 block border-t border-border/60 px-3 py-2 text-xs text-primary hover:bg-accent"
            >
              Gérer les clusters →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function NamespaceSwitcher() {
  const { namespaces, namespace, setNamespace } = useClusters();
  if (namespaces.length === 0) return null;
  return (
    <select
      value={namespace}
      onChange={(e) => setNamespace(e.target.value)}
      className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none hover:border-primary/50"
      title="Namespace"
    >
      <option value="">Tous les namespaces</option>
      {namespaces.map((ns) => (
        <option key={ns} value={ns}>
          {ns}
        </option>
      ))}
    </select>
  );
}

function dot(status?: string): string {
  if (status === "connected") return "bg-primary status-blink";
  if (status === "error") return "bg-destructive";
  return "bg-muted-foreground/50";
}
