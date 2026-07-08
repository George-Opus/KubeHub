// Vide par défaut = appels API en relatif (même origine, ex. via l'ingress `/api`).
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export type User = {
  id: number;
  email: string;
  username: string;
  created_at: string;
};

export type RegistrationStatus = {
  enabled: boolean;
  bootstrap: boolean;
};

export type Cluster = {
  id: number;
  name: string;
  description: string | null;
  context: string | null;
  color: string;
  status: string;
  last_error: string | null;
  server_url: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ClusterCreatePayload = {
  name: string;
  kubeconfig: string;
  context?: string | null;
  description?: string | null;
  color?: string;
};

export type ClusterOverview = {
  cluster: { id: number; name: string };
  version: string | null;
  platform: string | null;
  counts: {
    nodes: number;
    nodes_ready: number;
    namespaces: number;
    pods: number;
    deployments: number;
    services: number;
  };
  capacity: { cpu_cores: number; memory_bytes: number };
  pod_phases: Record<string, number>;
  nodes: {
    name: string;
    ready: boolean;
    roles: string[];
    kubelet_version: string | null;
    os_image: string | null;
    cpu: string | null;
    memory: string | null;
    internal_ip: string | null;
  }[];
};

export type ResourceItem = Record<string, unknown> & {
  name: string;
  namespace: string | null;
  created_at: string | null;
  labels: Record<string, string>;
};

export type ResourceList = {
  kind: string;
  namespaced: boolean;
  total: number;
  items: ResourceItem[];
};

export type ResourceDetail = {
  kind: string;
  object: Record<string, unknown>;
  yaml: string;
};

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail ?? detail;
      if (Array.isArray(detail)) {
        detail = detail.map((d) => d.msg ?? JSON.stringify(d)).join(", ");
      }
    } catch {
      /* ignore */
    }
    throw new ApiError(String(detail), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  register: (email: string, username: string, password: string) =>
    request<User>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, username, password }),
    }),

  login: async (username: string, password: string) => {
    const body = new URLSearchParams({ username, password });
    return request<{ access_token: string; token_type: string }>("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  },

  registrationStatus: () => request<RegistrationStatus>("/api/auth/registration-status"),

  me: (token: string) => request<User>("/api/auth/me", {}, token),

  // --- Clusters ---
  listClusters: (token: string) => request<Cluster[]>("/api/clusters", {}, token),

  getCluster: (token: string, id: number) => request<Cluster>(`/api/clusters/${id}`, {}, token),

  createCluster: (token: string, payload: ClusterCreatePayload) =>
    request<Cluster>("/api/clusters", { method: "POST", body: JSON.stringify(payload) }, token),

  updateCluster: (token: string, id: number, payload: Partial<ClusterCreatePayload>) =>
    request<Cluster>(`/api/clusters/${id}`, { method: "PATCH", body: JSON.stringify(payload) }, token),

  deleteCluster: (token: string, id: number) =>
    request<void>(`/api/clusters/${id}`, { method: "DELETE" }, token),

  testCluster: (token: string, id: number) =>
    request<Cluster>(`/api/clusters/${id}/test`, { method: "POST" }, token),

  overview: (token: string, id: number) =>
    request<ClusterOverview>(`/api/clusters/${id}/overview`, {}, token),

  // --- Resources ---
  namespaces: (token: string, clusterId: number) =>
    request<string[]>(`/api/clusters/${clusterId}/namespaces-list`, {}, token),

  listResources: (token: string, clusterId: number, kind: string, namespace?: string) =>
    request<ResourceList>(
      `/api/clusters/${clusterId}/resources/${kind}${qs({ namespace })}`,
      {},
      token,
    ),

  getResource: (token: string, clusterId: number, kind: string, name: string, namespace?: string) =>
    request<ResourceDetail>(
      `/api/clusters/${clusterId}/resources/${kind}/${encodeURIComponent(name)}${qs({ namespace })}`,
      {},
      token,
    ),

  deleteResource: (token: string, clusterId: number, kind: string, name: string, namespace?: string) =>
    request<void>(
      `/api/clusters/${clusterId}/resources/${kind}/${encodeURIComponent(name)}${qs({ namespace })}`,
      { method: "DELETE" },
      token,
    ),

  scaleDeployment: (token: string, clusterId: number, name: string, namespace: string, replicas: number) =>
    request<{ replicas: number }>(
      `/api/clusters/${clusterId}/resources/deployments/${encodeURIComponent(name)}/scale${qs({ namespace })}`,
      { method: "POST", body: JSON.stringify({ replicas }) },
      token,
    ),

  restartDeployment: (token: string, clusterId: number, name: string, namespace: string) =>
    request<{ restarted_at: string }>(
      `/api/clusters/${clusterId}/resources/deployments/${encodeURIComponent(name)}/restart${qs({ namespace })}`,
      { method: "POST" },
      token,
    ),

  podLogsWsUrl: (clusterId: number, namespace: string, pod: string, token: string, container?: string) =>
    wsUrl(`/api/clusters/${clusterId}/pods/${namespace}/${pod}/logs${qs({ token, container })}`),

  podExecWsUrl: (clusterId: number, namespace: string, pod: string, token: string, container?: string) =>
    wsUrl(`/api/clusters/${clusterId}/pods/${namespace}/${pod}/exec${qs({ token, container })}`),
};

function wsUrl(path: string): string {
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}${path}`;
  }
  const wsBase = API_URL.replace(/^http/, "ws");
  return `${wsBase}${path}`;
}

export { ApiError, API_URL };
