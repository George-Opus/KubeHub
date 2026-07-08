"""Listing et actions génériques sur les ressources Kubernetes."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

import yaml
from fastapi import APIRouter, Depends, HTTPException, Query
from kubernetes.client.exceptions import ApiException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.database import get_db
from app.models import User
from app.routers.clusters import get_owned_cluster
from app.services import kube
from app.services.kube import ClusterClient

router = APIRouter(prefix="/api/clusters/{cluster_id}", tags=["resources"])


def _iso(ts) -> str | None:
    if not ts:
        return None
    if isinstance(ts, datetime):
        return ts.astimezone(timezone.utc).isoformat()
    return str(ts)


def _meta(obj) -> dict[str, Any]:
    m = obj.metadata
    return {
        "name": m.name,
        "namespace": m.namespace,
        "created_at": _iso(m.creation_timestamp),
        "labels": m.labels or {},
    }


# --- Summarizers --------------------------------------------------------------

def _sum_pod(p) -> dict:
    statuses = p.status.container_statuses or []
    ready = sum(1 for c in statuses if c.ready)
    total = len(statuses)
    restarts = sum(c.restart_count for c in statuses)
    return {
        **_meta(p),
        "phase": p.status.phase,
        "ready": f"{ready}/{total}",
        "restarts": restarts,
        "node": p.spec.node_name,
        "pod_ip": p.status.pod_ip,
    }


def _sum_deployment(d) -> dict:
    s = d.status
    return {
        **_meta(d),
        "ready": f"{s.ready_replicas or 0}/{s.replicas or 0}",
        "up_to_date": s.updated_replicas or 0,
        "available": s.available_replicas or 0,
        "replicas": d.spec.replicas or 0,
    }


def _sum_statefulset(d) -> dict:
    s = d.status
    return {**_meta(d), "ready": f"{s.ready_replicas or 0}/{d.spec.replicas or 0}", "replicas": d.spec.replicas or 0}


def _sum_daemonset(d) -> dict:
    s = d.status
    return {
        **_meta(d),
        "desired": s.desired_number_scheduled or 0,
        "ready": s.number_ready or 0,
        "available": s.number_available or 0,
    }


def _sum_replicaset(d) -> dict:
    s = d.status
    return {**_meta(d), "ready": f"{s.ready_replicas or 0}/{d.spec.replicas or 0}", "replicas": d.spec.replicas or 0}


def _sum_job(j) -> dict:
    s = j.status
    return {
        **_meta(j),
        "completions": f"{s.succeeded or 0}/{j.spec.completions or 1}",
        "active": s.active or 0,
        "failed": s.failed or 0,
    }


def _sum_cronjob(c) -> dict:
    return {
        **_meta(c),
        "schedule": c.spec.schedule,
        "suspend": c.spec.suspend or False,
        "active": len(c.status.active or []),
        "last_schedule": _iso(c.status.last_schedule_time),
    }


def _sum_service(s) -> dict:
    ports = [f"{p.port}{('/' + p.protocol) if p.protocol else ''}" for p in (s.spec.ports or [])]
    return {
        **_meta(s),
        "type": s.spec.type,
        "cluster_ip": s.spec.cluster_ip,
        "external_ip": ",".join(s.spec.external_i_ps) if s.spec.external_i_ps else None,
        "ports": ports,
    }


def _sum_ingress(i) -> dict:
    hosts = [r.host for r in (i.spec.rules or []) if r.host]
    lb = i.status.load_balancer.ingress if i.status and i.status.load_balancer else None
    addresses = [x.ip or x.hostname for x in (lb or []) if (x.ip or x.hostname)]
    return {
        **_meta(i),
        "class": i.spec.ingress_class_name,
        "hosts": hosts,
        "addresses": addresses,
    }


def _sum_configmap(c) -> dict:
    return {**_meta(c), "keys": len(c.data or {}) + len(c.binary_data or {})}


def _sum_secret(s) -> dict:
    return {**_meta(s), "type": s.type, "keys": len(s.data or {})}


def _sum_pvc(p) -> dict:
    return {
        **_meta(p),
        "status": p.status.phase,
        "volume": p.spec.volume_name,
        "capacity": (p.status.capacity or {}).get("storage") if p.status.capacity else None,
        "storage_class": p.spec.storage_class_name,
        "access_modes": p.spec.access_modes or [],
    }


def _sum_pv(p) -> dict:
    return {
        "name": p.metadata.name,
        "namespace": None,
        "created_at": _iso(p.metadata.creation_timestamp),
        "labels": p.metadata.labels or {},
        "status": p.status.phase,
        "capacity": (p.spec.capacity or {}).get("storage") if p.spec.capacity else None,
        "storage_class": p.spec.storage_class_name,
        "access_modes": p.spec.access_modes or [],
        "reclaim_policy": p.spec.persistent_volume_reclaim_policy,
    }


def _sum_storageclass(s) -> dict:
    return {
        "name": s.metadata.name,
        "namespace": None,
        "created_at": _iso(s.metadata.creation_timestamp),
        "labels": s.metadata.labels or {},
        "provisioner": s.provisioner,
        "reclaim_policy": s.reclaim_policy,
        "volume_binding_mode": s.volume_binding_mode,
    }


def _sum_namespace(n) -> dict:
    return {
        "name": n.metadata.name,
        "namespace": None,
        "created_at": _iso(n.metadata.creation_timestamp),
        "labels": n.metadata.labels or {},
        "status": n.status.phase,
    }


def _sum_node(n) -> dict:
    conditions = {c.type: c.status for c in (n.status.conditions or [])}
    roles = []
    for label in (n.metadata.labels or {}):
        if label.startswith("node-role.kubernetes.io/"):
            roles.append(label.split("/", 1)[1] or "master")
    internal_ip = None
    for addr in (n.status.addresses or []):
        if addr.type == "InternalIP":
            internal_ip = addr.address
    return {
        "name": n.metadata.name,
        "namespace": None,
        "created_at": _iso(n.metadata.creation_timestamp),
        "labels": n.metadata.labels or {},
        "ready": conditions.get("Ready") == "True",
        "roles": roles or ["worker"],
        "version": n.status.node_info.kubelet_version if n.status.node_info else None,
        "os_image": n.status.node_info.os_image if n.status.node_info else None,
        "internal_ip": internal_ip,
    }


def _sum_event(e) -> dict:
    return {
        "name": e.metadata.name,
        "namespace": e.metadata.namespace,
        "created_at": _iso(e.metadata.creation_timestamp),
        "labels": {},
        "type": e.type,
        "reason": e.reason,
        "message": e.message,
        "object": f"{e.involved_object.kind}/{e.involved_object.name}" if e.involved_object else None,
        "count": e.count,
        "last_seen": _iso(e.last_timestamp),
    }


class ResourceDef:
    def __init__(
        self,
        namespaced: bool,
        list_all: Callable[[ClusterClient], Any],
        list_ns: Callable[[ClusterClient, str], Any] | None,
        summarize: Callable[[Any], dict],
        read: Callable[[ClusterClient, str, str | None], Any] | None,
        delete: Callable[[ClusterClient, str, str | None], Any] | None,
    ):
        self.namespaced = namespaced
        self.list_all = list_all
        self.list_ns = list_ns
        self.summarize = summarize
        self.read = read
        self.delete = delete


REGISTRY: dict[str, ResourceDef] = {
    "pods": ResourceDef(
        True,
        lambda c: c.core.list_pod_for_all_namespaces(),
        lambda c, ns: c.core.list_namespaced_pod(ns),
        _sum_pod,
        lambda c, name, ns: c.core.read_namespaced_pod(name, ns),
        lambda c, name, ns: c.core.delete_namespaced_pod(name, ns),
    ),
    "deployments": ResourceDef(
        True,
        lambda c: c.apps.list_deployment_for_all_namespaces(),
        lambda c, ns: c.apps.list_namespaced_deployment(ns),
        _sum_deployment,
        lambda c, name, ns: c.apps.read_namespaced_deployment(name, ns),
        lambda c, name, ns: c.apps.delete_namespaced_deployment(name, ns),
    ),
    "statefulsets": ResourceDef(
        True,
        lambda c: c.apps.list_stateful_set_for_all_namespaces(),
        lambda c, ns: c.apps.list_namespaced_stateful_set(ns),
        _sum_statefulset,
        lambda c, name, ns: c.apps.read_namespaced_stateful_set(name, ns),
        lambda c, name, ns: c.apps.delete_namespaced_stateful_set(name, ns),
    ),
    "daemonsets": ResourceDef(
        True,
        lambda c: c.apps.list_daemon_set_for_all_namespaces(),
        lambda c, ns: c.apps.list_namespaced_daemon_set(ns),
        _sum_daemonset,
        lambda c, name, ns: c.apps.read_namespaced_daemon_set(name, ns),
        lambda c, name, ns: c.apps.delete_namespaced_daemon_set(name, ns),
    ),
    "replicasets": ResourceDef(
        True,
        lambda c: c.apps.list_replica_set_for_all_namespaces(),
        lambda c, ns: c.apps.list_namespaced_replica_set(ns),
        _sum_replicaset,
        lambda c, name, ns: c.apps.read_namespaced_replica_set(name, ns),
        lambda c, name, ns: c.apps.delete_namespaced_replica_set(name, ns),
    ),
    "jobs": ResourceDef(
        True,
        lambda c: c.batch.list_job_for_all_namespaces(),
        lambda c, ns: c.batch.list_namespaced_job(ns),
        _sum_job,
        lambda c, name, ns: c.batch.read_namespaced_job(name, ns),
        lambda c, name, ns: c.batch.delete_namespaced_job(name, ns),
    ),
    "cronjobs": ResourceDef(
        True,
        lambda c: c.batch.list_cron_job_for_all_namespaces(),
        lambda c, ns: c.batch.list_namespaced_cron_job(ns),
        _sum_cronjob,
        lambda c, name, ns: c.batch.read_namespaced_cron_job(name, ns),
        lambda c, name, ns: c.batch.delete_namespaced_cron_job(name, ns),
    ),
    "services": ResourceDef(
        True,
        lambda c: c.core.list_service_for_all_namespaces(),
        lambda c, ns: c.core.list_namespaced_service(ns),
        _sum_service,
        lambda c, name, ns: c.core.read_namespaced_service(name, ns),
        lambda c, name, ns: c.core.delete_namespaced_service(name, ns),
    ),
    "ingresses": ResourceDef(
        True,
        lambda c: c.networking.list_ingress_for_all_namespaces(),
        lambda c, ns: c.networking.list_namespaced_ingress(ns),
        _sum_ingress,
        lambda c, name, ns: c.networking.read_namespaced_ingress(name, ns),
        lambda c, name, ns: c.networking.delete_namespaced_ingress(name, ns),
    ),
    "configmaps": ResourceDef(
        True,
        lambda c: c.core.list_config_map_for_all_namespaces(),
        lambda c, ns: c.core.list_namespaced_config_map(ns),
        _sum_configmap,
        lambda c, name, ns: c.core.read_namespaced_config_map(name, ns),
        lambda c, name, ns: c.core.delete_namespaced_config_map(name, ns),
    ),
    "secrets": ResourceDef(
        True,
        lambda c: c.core.list_secret_for_all_namespaces(),
        lambda c, ns: c.core.list_namespaced_secret(ns),
        _sum_secret,
        lambda c, name, ns: c.core.read_namespaced_secret(name, ns),
        lambda c, name, ns: c.core.delete_namespaced_secret(name, ns),
    ),
    "persistentvolumeclaims": ResourceDef(
        True,
        lambda c: c.core.list_persistent_volume_claim_for_all_namespaces(),
        lambda c, ns: c.core.list_namespaced_persistent_volume_claim(ns),
        _sum_pvc,
        lambda c, name, ns: c.core.read_namespaced_persistent_volume_claim(name, ns),
        lambda c, name, ns: c.core.delete_namespaced_persistent_volume_claim(name, ns),
    ),
    "persistentvolumes": ResourceDef(
        False,
        lambda c: c.core.list_persistent_volume(),
        None,
        _sum_pv,
        lambda c, name, ns: c.core.read_persistent_volume(name),
        lambda c, name, ns: c.core.delete_persistent_volume(name),
    ),
    "storageclasses": ResourceDef(
        False,
        lambda c: c.storage.list_storage_class(),
        None,
        _sum_storageclass,
        lambda c, name, ns: c.storage.read_storage_class(name),
        lambda c, name, ns: c.storage.delete_storage_class(name),
    ),
    "namespaces": ResourceDef(
        False,
        lambda c: c.core.list_namespace(),
        None,
        _sum_namespace,
        lambda c, name, ns: c.core.read_namespace(name),
        lambda c, name, ns: c.core.delete_namespace(name),
    ),
    "nodes": ResourceDef(
        False,
        lambda c: c.core.list_node(),
        None,
        _sum_node,
        lambda c, name, ns: c.core.read_node(name),
        None,
    ),
    "events": ResourceDef(
        True,
        lambda c: c.core.list_event_for_all_namespaces(),
        lambda c, ns: c.core.list_namespaced_event(ns),
        _sum_event,
        None,
        None,
    ),
}


class ScalePayload(BaseModel):
    replicas: int


def _resolve(cluster_id: int, db: Session, user: User) -> ClusterClient:
    cluster = get_owned_cluster(cluster_id, db, user)
    try:
        return kube.get_client(cluster)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Connexion cluster impossible : {exc}") from exc


@router.get("/namespaces-list")
def list_namespace_names(cluster_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cc = _resolve(cluster_id, db, user)
    try:
        items = cc.core.list_namespace().items
    except ApiException as exc:
        raise HTTPException(status_code=exc.status or 502, detail=exc.reason) from exc
    return [n.metadata.name for n in items]


@router.get("/resources/{kind}")
def list_resources(
    cluster_id: int,
    kind: str,
    namespace: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rd = REGISTRY.get(kind)
    if not rd:
        raise HTTPException(status_code=404, detail=f"Type de ressource inconnu : {kind}")
    cc = _resolve(cluster_id, db, user)
    try:
        if namespace and rd.namespaced and rd.list_ns:
            result = rd.list_ns(cc, namespace)
        else:
            result = rd.list_all(cc)
    except ApiException as exc:
        raise HTTPException(status_code=exc.status or 502, detail=exc.reason) from exc

    items = [rd.summarize(i) for i in result.items]
    return {"kind": kind, "namespaced": rd.namespaced, "total": len(items), "items": items}


@router.get("/resources/{kind}/{name}")
def get_resource(
    cluster_id: int,
    kind: str,
    name: str,
    namespace: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rd = REGISTRY.get(kind)
    if not rd or not rd.read:
        raise HTTPException(status_code=404, detail=f"Lecture non supportée pour : {kind}")
    cc = _resolve(cluster_id, db, user)
    try:
        obj = rd.read(cc, name, namespace)
    except ApiException as exc:
        raise HTTPException(status_code=exc.status or 502, detail=exc.reason) from exc

    data = cc.api_client.sanitize_for_serialization(obj)
    if kind == "secrets" and isinstance(data, dict):
        # Ne pas renvoyer les valeurs de secrets en clair.
        if data.get("data"):
            data["data"] = {k: "<redacted>" for k in data["data"]}
    return {"kind": kind, "object": data, "yaml": yaml.safe_dump(data, sort_keys=False, allow_unicode=True)}


@router.delete("/resources/{kind}/{name}", status_code=204)
def delete_resource(
    cluster_id: int,
    kind: str,
    name: str,
    namespace: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rd = REGISTRY.get(kind)
    if not rd or not rd.delete:
        raise HTTPException(status_code=400, detail=f"Suppression non supportée pour : {kind}")
    cc = _resolve(cluster_id, db, user)
    try:
        rd.delete(cc, name, namespace)
    except ApiException as exc:
        raise HTTPException(status_code=exc.status or 502, detail=exc.reason) from exc


@router.post("/resources/deployments/{name}/scale")
def scale_deployment(
    cluster_id: int,
    name: str,
    payload: ScalePayload,
    namespace: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cc = _resolve(cluster_id, db, user)
    try:
        cc.apps.patch_namespaced_deployment_scale(
            name, namespace, {"spec": {"replicas": payload.replicas}}
        )
    except ApiException as exc:
        raise HTTPException(status_code=exc.status or 502, detail=exc.reason) from exc
    return {"name": name, "namespace": namespace, "replicas": payload.replicas}


@router.post("/resources/deployments/{name}/restart")
def restart_deployment(
    cluster_id: int,
    name: str,
    namespace: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cc = _resolve(cluster_id, db, user)
    now = datetime.now(timezone.utc).isoformat()
    body = {
        "spec": {
            "template": {
                "metadata": {"annotations": {"kubehub.io/restartedAt": now}}
            }
        }
    }
    try:
        cc.apps.patch_namespaced_deployment(name, namespace, body)
    except ApiException as exc:
        raise HTTPException(status_code=exc.status or 502, detail=exc.reason) from exc
    return {"name": name, "namespace": namespace, "restarted_at": now}
