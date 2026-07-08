"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, ScrollText, TerminalSquare, Trash2, X, RotateCw, Scaling } from "lucide-react";
import { api, type ResourceItem } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { PodTerminal } from "@/components/PodTerminal";

type Tab = "yaml" | "logs" | "exec";

type Props = {
  clusterId: number;
  kind: string;
  item: ResourceItem;
  onClose: () => void;
  onChanged: () => void;
};

export function ResourceDrawer({ clusterId, kind, item, onClose, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>("yaml");
  const [yaml, setYaml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const token = getToken();
  const namespace = (item.namespace as string) || undefined;
  const name = item.name as string;
  const isPod = kind === "pods";
  const isDeployment = kind === "deployments";

  const loadYaml = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError("");
    api
      .getResource(token, clusterId, kind, name, namespace)
      .then((d) => setYaml(d.yaml))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, clusterId, kind, name, namespace]);

  useEffect(() => {
    loadYaml();
  }, [loadYaml]);

  const doDelete = async () => {
    if (!token) return;
    if (!confirm(`Supprimer ${kind}/${name} ?`)) return;
    setBusy(true);
    try {
      await api.deleteResource(token, clusterId, kind, name, namespace);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const doRestart = async () => {
    if (!token || !namespace) return;
    setBusy(true);
    try {
      await api.restartDeployment(token, clusterId, name, namespace);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const doScale = async () => {
    if (!token || !namespace) return;
    const input = prompt("Nombre de replicas :", "1");
    if (input === null) return;
    const replicas = Number(input);
    if (Number.isNaN(replicas) || replicas < 0) return;
    setBusy(true);
    try {
      await api.scaleDeployment(token, clusterId, name, namespace, replicas);
      onChanged();
      loadYaml();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const logsUrl =
    token && namespace ? api.podLogsWsUrl(clusterId, namespace, name, token) : "";
  const execUrl =
    token && namespace ? api.podExecWsUrl(clusterId, namespace, name, token) : "";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] bg-black/40 dark:bg-black/60"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "tween", duration: 0.2 }}
          className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col border-l border-border bg-background font-mono text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="text-primary">{kind}</span>
                {namespace && <span>· {namespace}</span>}
              </div>
              <h2 className="truncate text-sm font-semibold text-foreground">{name}</h2>
            </div>
            <button onClick={onClose} className="btn-icon" title="Fermer">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1 border-b border-border/60 px-3 py-2">
            <TabButton active={tab === "yaml"} onClick={() => setTab("yaml")} icon={<FileText className="h-3.5 w-3.5" />}>
              YAML
            </TabButton>
            {isPod && (
              <>
                <TabButton active={tab === "logs"} onClick={() => setTab("logs")} icon={<ScrollText className="h-3.5 w-3.5" />}>
                  Logs
                </TabButton>
                <TabButton active={tab === "exec"} onClick={() => setTab("exec")} icon={<TerminalSquare className="h-3.5 w-3.5" />}>
                  Shell
                </TabButton>
              </>
            )}
            <div className="ml-auto flex items-center gap-1">
              {isDeployment && (
                <>
                  <button onClick={doScale} disabled={busy} className="term-btn" title="Scale">
                    <Scaling className="h-3.5 w-3.5" /> Scale
                  </button>
                  <button onClick={doRestart} disabled={busy} className="term-btn" title="Restart">
                    <RotateCw className="h-3.5 w-3.5" /> Restart
                  </button>
                </>
              )}
              <button onClick={doDelete} disabled={busy} className="term-btn text-destructive" title="Supprimer">
                <Trash2 className="h-3.5 w-3.5" /> Supprimer
              </button>
            </div>
          </div>

          {error && <p className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">{error}</p>}

          <div className="min-h-0 flex-1 overflow-hidden p-3">
            {tab === "yaml" && (
              <div className="h-full overflow-auto rounded-lg border border-border/60 bg-card">
                {loading ? (
                  <p className="p-4 text-xs text-muted-foreground">Chargement…</p>
                ) : (
                  <pre className="whitespace-pre p-4 text-xs leading-relaxed text-foreground">{yaml}</pre>
                )}
              </div>
            )}
            {tab === "logs" && logsUrl && <PodTerminal wsUrl={logsUrl} interactive={false} />}
            {tab === "exec" && execUrl && <PodTerminal wsUrl={execUrl} interactive />}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
