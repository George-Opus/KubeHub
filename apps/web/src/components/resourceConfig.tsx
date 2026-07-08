import type { ReactNode } from "react";
import type { ResourceItem } from "@/lib/api";

export type Column = {
  key: string;
  label: string;
  render?: (item: ResourceItem) => ReactNode;
  className?: string;
};

export type ResourceKind = {
  kind: string; // clé API (ex. "pods")
  label: string;
  namespaced: boolean;
  columns: Column[];
};

export type ResourceGroup = {
  slug: string;
  title: string;
  kinds: ResourceKind[];
};

export function age(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 365) return `${d}j`;
  return `${Math.floor(d / 365)}a`;
}

function str(item: ResourceItem, key: string): string {
  const v = item[key];
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  return String(v);
}

export function StatusBadge({ value }: { value: string }) {
  const v = (value || "").toLowerCase();
  let cls = "border-border text-muted-foreground";
  if (["running", "active", "bound", "ready", "succeeded", "true"].includes(v)) {
    cls = "border-primary/40 bg-primary/10 text-primary";
  } else if (["pending", "containercreating", "released", "warning"].includes(v)) {
    cls = "border-amber-500/40 bg-amber-500/10 text-amber-500";
  } else if (["failed", "error", "crashloopbackoff", "evicted", "terminating", "false"].includes(v)) {
    cls = "border-destructive/40 bg-destructive/10 text-destructive";
  }
  return <span className={`badge ${cls}`}>{value || "—"}</span>;
}

const AGE_COL: Column = { key: "created_at", label: "Âge", render: (i) => age(i.created_at), className: "w-16 text-right" };
const NS_COL: Column = { key: "namespace", label: "Namespace", render: (i) => str(i, "namespace") };

// --- Définitions par type ---

const pods: ResourceKind = {
  kind: "pods",
  label: "Pods",
  namespaced: true,
  columns: [
    { key: "name", label: "Nom" },
    NS_COL,
    { key: "ready", label: "Ready", render: (i) => str(i, "ready") },
    { key: "phase", label: "Statut", render: (i) => <StatusBadge value={str(i, "phase")} /> },
    { key: "restarts", label: "Restarts", render: (i) => str(i, "restarts") },
    { key: "node", label: "Nœud", render: (i) => str(i, "node") },
    AGE_COL,
  ],
};

const deployments: ResourceKind = {
  kind: "deployments",
  label: "Deployments",
  namespaced: true,
  columns: [
    { key: "name", label: "Nom" },
    NS_COL,
    { key: "ready", label: "Ready", render: (i) => str(i, "ready") },
    { key: "up_to_date", label: "À jour", render: (i) => str(i, "up_to_date") },
    { key: "available", label: "Dispo", render: (i) => str(i, "available") },
    AGE_COL,
  ],
};

const statefulsets: ResourceKind = {
  kind: "statefulsets",
  label: "StatefulSets",
  namespaced: true,
  columns: [
    { key: "name", label: "Nom" },
    NS_COL,
    { key: "ready", label: "Ready", render: (i) => str(i, "ready") },
    AGE_COL,
  ],
};

const daemonsets: ResourceKind = {
  kind: "daemonsets",
  label: "DaemonSets",
  namespaced: true,
  columns: [
    { key: "name", label: "Nom" },
    NS_COL,
    { key: "desired", label: "Désiré", render: (i) => str(i, "desired") },
    { key: "ready", label: "Ready", render: (i) => str(i, "ready") },
    { key: "available", label: "Dispo", render: (i) => str(i, "available") },
    AGE_COL,
  ],
};

const replicasets: ResourceKind = {
  kind: "replicasets",
  label: "ReplicaSets",
  namespaced: true,
  columns: [
    { key: "name", label: "Nom" },
    NS_COL,
    { key: "ready", label: "Ready", render: (i) => str(i, "ready") },
    AGE_COL,
  ],
};

const jobs: ResourceKind = {
  kind: "jobs",
  label: "Jobs",
  namespaced: true,
  columns: [
    { key: "name", label: "Nom" },
    NS_COL,
    { key: "completions", label: "Complétions", render: (i) => str(i, "completions") },
    { key: "failed", label: "Échecs", render: (i) => str(i, "failed") },
    AGE_COL,
  ],
};

const cronjobs: ResourceKind = {
  kind: "cronjobs",
  label: "CronJobs",
  namespaced: true,
  columns: [
    { key: "name", label: "Nom" },
    NS_COL,
    { key: "schedule", label: "Planning", render: (i) => str(i, "schedule") },
    { key: "suspend", label: "Suspendu", render: (i) => <StatusBadge value={String(i.suspend)} /> },
    { key: "active", label: "Actifs", render: (i) => str(i, "active") },
    AGE_COL,
  ],
};

const services: ResourceKind = {
  kind: "services",
  label: "Services",
  namespaced: true,
  columns: [
    { key: "name", label: "Nom" },
    NS_COL,
    { key: "type", label: "Type", render: (i) => str(i, "type") },
    { key: "cluster_ip", label: "Cluster IP", render: (i) => str(i, "cluster_ip") },
    { key: "ports", label: "Ports", render: (i) => str(i, "ports") },
    AGE_COL,
  ],
};

const ingresses: ResourceKind = {
  kind: "ingresses",
  label: "Ingresses",
  namespaced: true,
  columns: [
    { key: "name", label: "Nom" },
    NS_COL,
    { key: "class", label: "Classe", render: (i) => str(i, "class") },
    { key: "hosts", label: "Hôtes", render: (i) => str(i, "hosts") },
    { key: "addresses", label: "Adresses", render: (i) => str(i, "addresses") },
    AGE_COL,
  ],
};

const configmaps: ResourceKind = {
  kind: "configmaps",
  label: "ConfigMaps",
  namespaced: true,
  columns: [
    { key: "name", label: "Nom" },
    NS_COL,
    { key: "keys", label: "Clés", render: (i) => str(i, "keys") },
    AGE_COL,
  ],
};

const secrets: ResourceKind = {
  kind: "secrets",
  label: "Secrets",
  namespaced: true,
  columns: [
    { key: "name", label: "Nom" },
    NS_COL,
    { key: "type", label: "Type", render: (i) => str(i, "type") },
    { key: "keys", label: "Clés", render: (i) => str(i, "keys") },
    AGE_COL,
  ],
};

const pvcs: ResourceKind = {
  kind: "persistentvolumeclaims",
  label: "PVC",
  namespaced: true,
  columns: [
    { key: "name", label: "Nom" },
    NS_COL,
    { key: "status", label: "Statut", render: (i) => <StatusBadge value={str(i, "status")} /> },
    { key: "capacity", label: "Capacité", render: (i) => str(i, "capacity") },
    { key: "storage_class", label: "Classe", render: (i) => str(i, "storage_class") },
    AGE_COL,
  ],
};

const pvs: ResourceKind = {
  kind: "persistentvolumes",
  label: "PV",
  namespaced: false,
  columns: [
    { key: "name", label: "Nom" },
    { key: "status", label: "Statut", render: (i) => <StatusBadge value={str(i, "status")} /> },
    { key: "capacity", label: "Capacité", render: (i) => str(i, "capacity") },
    { key: "storage_class", label: "Classe", render: (i) => str(i, "storage_class") },
    { key: "reclaim_policy", label: "Reclaim", render: (i) => str(i, "reclaim_policy") },
    AGE_COL,
  ],
};

const storageclasses: ResourceKind = {
  kind: "storageclasses",
  label: "StorageClasses",
  namespaced: false,
  columns: [
    { key: "name", label: "Nom" },
    { key: "provisioner", label: "Provisioner", render: (i) => str(i, "provisioner") },
    { key: "reclaim_policy", label: "Reclaim", render: (i) => str(i, "reclaim_policy") },
    { key: "volume_binding_mode", label: "Binding", render: (i) => str(i, "volume_binding_mode") },
    AGE_COL,
  ],
};

export const NODES_KIND: ResourceKind = {
  kind: "nodes",
  label: "Nodes",
  namespaced: false,
  columns: [
    { key: "name", label: "Nom" },
    { key: "ready", label: "Statut", render: (i) => <StatusBadge value={i.ready ? "Ready" : "NotReady"} /> },
    { key: "roles", label: "Rôles", render: (i) => str(i, "roles") },
    { key: "version", label: "Version", render: (i) => str(i, "version") },
    { key: "internal_ip", label: "IP interne", render: (i) => str(i, "internal_ip") },
    { key: "os_image", label: "OS", render: (i) => str(i, "os_image") },
    AGE_COL,
  ],
};

export const NAMESPACES_KIND: ResourceKind = {
  kind: "namespaces",
  label: "Namespaces",
  namespaced: false,
  columns: [
    { key: "name", label: "Nom" },
    { key: "status", label: "Statut", render: (i) => <StatusBadge value={str(i, "status")} /> },
    AGE_COL,
  ],
};

export const EVENTS_KIND: ResourceKind = {
  kind: "events",
  label: "Events",
  namespaced: true,
  columns: [
    { key: "type", label: "Type", render: (i) => <StatusBadge value={str(i, "type")} /> },
    { key: "reason", label: "Raison", render: (i) => str(i, "reason") },
    { key: "object", label: "Objet", render: (i) => str(i, "object") },
    NS_COL,
    { key: "message", label: "Message", render: (i) => str(i, "message") },
    { key: "count", label: "×", render: (i) => str(i, "count"), className: "w-10 text-right" },
  ],
};

export const GROUPS: Record<string, ResourceGroup> = {
  workloads: {
    slug: "workloads",
    title: "Workloads",
    kinds: [pods, deployments, statefulsets, daemonsets, replicasets, jobs, cronjobs],
  },
  config: {
    slug: "config",
    title: "Configuration",
    kinds: [configmaps, secrets],
  },
  network: {
    slug: "network",
    title: "Réseau",
    kinds: [services, ingresses],
  },
  storage: {
    slug: "storage",
    title: "Stockage",
    kinds: [pvcs, pvs, storageclasses],
  },
};
