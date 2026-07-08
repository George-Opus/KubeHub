const ACTIVE_CLUSTER_KEY = "kubehub_active_cluster";

export function getActiveClusterId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(ACTIVE_CLUSTER_KEY);
  return raw ? Number(raw) : null;
}

export function setActiveClusterId(id: number): void {
  localStorage.setItem(ACTIVE_CLUSTER_KEY, String(id));
}

export function clearActiveClusterId(): void {
  localStorage.removeItem(ACTIVE_CLUSTER_KEY);
}
