"use client";

import { useCallback, useEffect, useState } from "react";
import { Boxes, Cpu, Layers, MemoryStick, Network, RefreshCw, Server } from "lucide-react";
import { api, type ClusterOverview } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useClusters } from "@/components/ClusterContext";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/resourceConfig";

export default function OverviewPage() {
  const { activeClusterId, activeCluster, loading: clustersLoading } = useClusters();
  const [data, setData] = useState<ClusterOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const token = getToken();

  const load = useCallback(() => {
    if (!token || activeClusterId == null) return;
    setLoading(true);
    setError("");
    api
      .overview(token, activeClusterId)
      .then(setData)
      .catch((e) => {
        setError(e.message);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [token, activeClusterId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!clustersLoading && activeClusterId == null) {
    return (
      <EmptyState
        title="Bienvenue sur KubeHub"
        hint="Ajoutez votre premier cluster Kubernetes en collant un kubeconfig pour commencer à l'explorer."
        action={{ href: "/dashboard/clusters", label: "Ajouter un cluster" }}
      />
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Vue d'ensemble</h1>
          <p className="text-xs text-muted-foreground">
            {activeCluster?.name}
            {data?.version && <span> · Kubernetes {data.version}</span>}
            {activeCluster?.server_url && <span> · {activeCluster.server_url}</span>}
          </p>
        </div>
        <button onClick={load} className="btn-ghost px-2.5 py-1.5" title="Rafraîchir">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat icon={<Server className="h-4 w-4" />} label="Nodes" value={`${data.counts.nodes_ready}/${data.counts.nodes}`} />
            <Stat icon={<Layers className="h-4 w-4" />} label="Namespaces" value={data.counts.namespaces} />
            <Stat icon={<Boxes className="h-4 w-4" />} label="Pods" value={data.counts.pods} />
            <Stat icon={<Boxes className="h-4 w-4" />} label="Deployments" value={data.counts.deployments} />
            <Stat icon={<Network className="h-4 w-4" />} label="Services" value={data.counts.services} />
            <Stat icon={<Cpu className="h-4 w-4" />} label="CPU (cores)" value={data.capacity.cpu_cores} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="card p-4 lg:col-span-1">
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Phases des pods</h2>
              <div className="space-y-2">
                {Object.entries(data.pod_phases).map(([phase, count]) => (
                  <div key={phase} className="flex items-center justify-between text-xs">
                    <StatusBadge value={phase} />
                    <span className="font-medium text-foreground">{count}</span>
                  </div>
                ))}
                {Object.keys(data.pod_phases).length === 0 && (
                  <p className="text-xs text-muted-foreground">Aucun pod.</p>
                )}
              </div>
              <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                <MemoryStick className="h-4 w-4" />
                Mémoire totale : {formatBytes(data.capacity.memory_bytes)}
              </div>
            </div>

            <div className="card p-4 lg:col-span-2">
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Nodes</h2>
              <div className="overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-2 py-1.5 font-medium">Nom</th>
                      <th className="px-2 py-1.5 font-medium">Statut</th>
                      <th className="px-2 py-1.5 font-medium">Rôles</th>
                      <th className="px-2 py-1.5 font-medium">Version</th>
                      <th className="px-2 py-1.5 font-medium">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.nodes.map((n) => (
                      <tr key={n.name} className="console-row">
                        <td className="px-2 py-1.5 text-foreground">{n.name}</td>
                        <td className="px-2 py-1.5">
                          <StatusBadge value={n.ready ? "Ready" : "NotReady"} />
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{n.roles.join(", ")}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{n.kubelet_version}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{n.internal_ip}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="card p-3">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}
