"""Gestion des clients Kubernetes multi-cluster.

Chaque cluster est stocké en base avec son kubeconfig chiffré (Fernet).
On construit à la demande un `ApiClient` isolé par cluster, mis en cache.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any

import yaml
from kubernetes import client as k8s_client
from kubernetes import config as k8s_config
from kubernetes.client import ApiClient

from app.models import Cluster
from app.services.crypto import decrypt


@dataclass
class ClusterClient:
    api_client: ApiClient
    server_url: str | None

    @property
    def core(self) -> k8s_client.CoreV1Api:
        return k8s_client.CoreV1Api(self.api_client)

    @property
    def apps(self) -> k8s_client.AppsV1Api:
        return k8s_client.AppsV1Api(self.api_client)

    @property
    def batch(self) -> k8s_client.BatchV1Api:
        return k8s_client.BatchV1Api(self.api_client)

    @property
    def networking(self) -> k8s_client.NetworkingV1Api:
        return k8s_client.NetworkingV1Api(self.api_client)

    @property
    def storage(self) -> k8s_client.StorageV1Api:
        return k8s_client.StorageV1Api(self.api_client)

    @property
    def rbac(self) -> k8s_client.RbacAuthorizationV1Api:
        return k8s_client.RbacAuthorizationV1Api(self.api_client)

    @property
    def version(self) -> k8s_client.VersionApi:
        return k8s_client.VersionApi(self.api_client)

    @property
    def custom(self) -> k8s_client.CustomObjectsApi:
        return k8s_client.CustomObjectsApi(self.api_client)


class _ClientCache:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        # key: (cluster_id, updated_at_epoch) -> ClusterClient
        self._cache: dict[int, tuple[float, ClusterClient]] = {}

    def get(self, cluster: Cluster) -> ClusterClient:
        stamp = cluster.updated_at.timestamp() if cluster.updated_at else 0.0
        with self._lock:
            cached = self._cache.get(cluster.id)
            if cached and cached[0] == stamp:
                return cached[1]
            built = _build_client(cluster)
            self._cache[cluster.id] = (stamp, built)
            return built

    def invalidate(self, cluster_id: int) -> None:
        with self._lock:
            self._cache.pop(cluster_id, None)


def _build_client(cluster: Cluster) -> ClusterClient:
    raw = decrypt(cluster.kubeconfig_encrypted)
    config_dict = yaml.safe_load(raw)
    if not isinstance(config_dict, dict):
        raise ValueError("Kubeconfig invalide")

    context = cluster.context or None
    api_client = k8s_config.new_client_from_config_dict(config_dict, context=context)

    server_url = None
    try:
        server_url = api_client.configuration.host
    except Exception:  # pragma: no cover
        pass
    return ClusterClient(api_client=api_client, server_url=server_url)


_cache = _ClientCache()


def get_client(cluster: Cluster) -> ClusterClient:
    return _cache.get(cluster)


def invalidate(cluster_id: int) -> None:
    _cache.invalidate(cluster_id)


def probe(cluster: Cluster) -> dict[str, Any]:
    """Teste la connexion à un cluster et renvoie sa version."""
    cc = _build_client(cluster)
    ver = cc.version.get_code()
    return {
        "server_url": cc.server_url,
        "git_version": getattr(ver, "git_version", None),
        "platform": getattr(ver, "platform", None),
    }


def kubeconfig_contexts(raw_kubeconfig: str) -> list[str]:
    config_dict = yaml.safe_load(raw_kubeconfig)
    if not isinstance(config_dict, dict):
        return []
    return [c.get("name") for c in config_dict.get("contexts", []) if c.get("name")]
