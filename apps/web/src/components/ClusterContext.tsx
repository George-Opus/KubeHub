"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, type Cluster } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { getActiveClusterId, setActiveClusterId } from "@/lib/cluster";

type ClusterContextValue = {
  clusters: Cluster[];
  activeCluster: Cluster | null;
  activeClusterId: number | null;
  setActiveCluster: (id: number) => void;
  namespaces: string[];
  namespace: string; // "" = tous
  setNamespace: (ns: string) => void;
  loading: boolean;
  refreshClusters: () => Promise<void>;
};

const Ctx = createContext<ClusterContextValue | null>(null);

export function ClusterProvider({ children }: { children: ReactNode }) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [namespace, setNamespace] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const refreshClusters = async () => {
    const token = getToken();
    if (!token) return;
    const list = await api.listClusters(token);
    setClusters(list);
    const stored = getActiveClusterId();
    const valid = list.find((c) => c.id === stored);
    const next = valid?.id ?? list[0]?.id ?? null;
    setActiveId(next);
    setLoading(false);
  };

  useEffect(() => {
    refreshClusters().catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token || activeId == null) {
      setNamespaces([]);
      return;
    }
    setNamespace("");
    api
      .namespaces(token, activeId)
      .then(setNamespaces)
      .catch(() => setNamespaces([]));
  }, [activeId]);

  const setActiveCluster = (id: number) => {
    setActiveId(id);
    setActiveClusterId(id);
  };

  const activeCluster = clusters.find((c) => c.id === activeId) ?? null;

  return (
    <Ctx.Provider
      value={{
        clusters,
        activeCluster,
        activeClusterId: activeId,
        setActiveCluster,
        namespaces,
        namespace,
        setNamespace,
        loading,
        refreshClusters,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useClusters() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useClusters must be used within ClusterProvider");
  return ctx;
}
