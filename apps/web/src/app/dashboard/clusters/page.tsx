"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Plus, RefreshCw, Trash2, XCircle, Circle } from "lucide-react";
import { api, ApiError, type Cluster } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useClusters } from "@/components/ClusterContext";
import { Modal } from "@/components/Modal";

export default function ClustersPage() {
  const { clusters, refreshClusters, activeCluster, setActiveCluster } = useClusters();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const token = getToken();

  const test = async (c: Cluster) => {
    if (!token) return;
    setBusyId(c.id);
    try {
      await api.testCluster(token, c.id);
      await refreshClusters();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (c: Cluster) => {
    if (!token) return;
    if (!confirm(`Supprimer le cluster « ${c.name} » ?`)) return;
    setBusyId(c.id);
    try {
      await api.deleteCluster(token, c.id);
      await refreshClusters();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Clusters</h1>
          <p className="text-xs text-muted-foreground">Connectez vos clusters Kubernetes via kubeconfig.</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Ajouter un cluster
        </button>
      </div>

      {clusters.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm text-foreground">Aucun cluster enregistré</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Collez le contenu d'un fichier kubeconfig pour connecter votre premier cluster.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clusters.map((c) => (
            <div
              key={c.id}
              className={`card p-4 ${activeCluster?.id === c.id ? "border-primary/50" : ""}`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">{c.name}</h3>
                  {c.description && <p className="truncate text-xs text-muted-foreground">{c.description}</p>}
                </div>
                <StatusIcon status={c.status} />
              </div>
              <p className="mb-1 truncate text-[11px] text-muted-foreground">{c.server_url ?? "—"}</p>
              {c.context && <p className="mb-2 text-[11px] text-muted-foreground">ctx: {c.context}</p>}
              {c.status === "error" && c.last_error && (
                <p className="mb-2 line-clamp-2 rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                  {c.last_error}
                </p>
              )}
              <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
                <button
                  onClick={() => setActiveCluster(c.id)}
                  disabled={activeCluster?.id === c.id}
                  className="term-btn"
                >
                  {activeCluster?.id === c.id ? "Actif" : "Activer"}
                </button>
                <button onClick={() => test(c)} disabled={busyId === c.id} className="term-btn">
                  <RefreshCw className={`h-3.5 w-3.5 ${busyId === c.id ? "animate-spin" : ""}`} /> Tester
                </button>
                <button onClick={() => remove(c)} disabled={busyId === c.id} className="term-btn ml-auto text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddClusterModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={async (id) => {
          setOpen(false);
          await refreshClusters();
          setActiveCluster(id);
        }}
      />
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "connected") return <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />;
  if (status === "error") return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
  return <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function AddClusterModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [form, setForm] = useState({ name: "", kubeconfig: "", context: "", description: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const token = getToken();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const cluster = await api.createCluster(token, {
        name: form.name,
        kubeconfig: form.kubeconfig,
        context: form.context || null,
        description: form.description || null,
      });
      setForm({ name: "", kubeconfig: "", context: "", description: "" });
      onCreated(cluster.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'ajout");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Ajouter un cluster" subtitle="Collez un kubeconfig complet." maxWidth="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Nom</label>
            <input
              className="input-field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="production-ovh"
              required
            />
          </div>
          <div>
            <label className="label">Contexte (optionnel)</label>
            <input
              className="input-field"
              value={form.context}
              onChange={(e) => setForm({ ...form, context: e.target.value })}
              placeholder="contexte par défaut"
            />
          </div>
        </div>
        <div>
          <label className="label">Description (optionnel)</label>
          <input
            className="input-field"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Kubeconfig</label>
          <textarea
            className="input-field h-56 resize-none font-mono text-xs"
            value={form.kubeconfig}
            onChange={(e) => setForm({ ...form, kubeconfig: e.target.value })}
            placeholder="apiVersion: v1&#10;clusters:&#10;- cluster:&#10;    server: https://..."
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Annuler
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Connexion…" : "Ajouter"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
