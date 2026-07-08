"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { api, type ResourceItem } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useClusters } from "@/components/ClusterContext";
import { ResourceDrawer } from "@/components/ResourceDrawer";
import type { ResourceKind } from "@/components/resourceConfig";
import { EmptyState } from "@/components/EmptyState";

type Props = {
  title: string;
  kinds: ResourceKind[];
};

export function ResourceGroupView({ title, kinds }: Props) {
  const { activeClusterId, activeCluster, namespace } = useClusters();
  const [activeKind, setActiveKind] = useState<ResourceKind>(kinds[0]);
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ResourceItem | null>(null);

  const token = getToken();

  const load = useCallback(() => {
    if (!token || activeClusterId == null) return;
    setLoading(true);
    setError("");
    const ns = activeKind.namespaced && namespace ? namespace : undefined;
    api
      .listResources(token, activeClusterId, activeKind.kind, ns)
      .then((r) => setItems(r.items))
      .catch((e) => {
        setError(e.message);
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [token, activeClusterId, activeKind, namespace]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = items.filter((i) =>
    search ? String(i.name).toLowerCase().includes(search.toLowerCase()) : true,
  );

  if (activeClusterId == null) {
    return <EmptyState title="Aucun cluster sélectionné" hint="Ajoutez un cluster pour commencer." />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground">
            {activeCluster?.name} · {namespace || "tous les namespaces"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input-field w-48 py-1.5 pl-8 text-xs"
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button onClick={load} className="btn-ghost px-2.5 py-1.5" title="Rafraîchir">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1 border-b border-border/60 pb-2">
        {kinds.map((k) => (
          <button
            key={k.kind}
            onClick={() => setActiveKind(k)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeKind.kind === k.kind
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border/60">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
            <tr className="border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground">
              {activeKind.columns.map((c) => (
                <th key={c.key} className={`px-3 py-2 font-medium ${c.className ?? ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, idx) => (
              <tr
                key={`${item.namespace ?? ""}/${item.name}/${idx}`}
                className="console-row cursor-pointer"
                onClick={() => setSelected(item)}
              >
                {activeKind.columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2 align-middle ${c.className ?? ""}`}>
                    {c.render ? c.render(item) : String(item[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <div className="p-8 text-center text-xs text-muted-foreground">Aucune ressource.</div>
        )}
        {loading && items.length === 0 && (
          <div className="p-8 text-center text-xs text-muted-foreground">Chargement…</div>
        )}
      </div>

      {selected && activeClusterId != null && (
        <ResourceDrawer
          clusterId={activeClusterId}
          kind={activeKind.kind}
          item={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
