from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.database import get_db
from app.models import Cluster, User
from app.schemas import ClusterCreate, ClusterOut, ClusterUpdate
from app.services import kube
from app.services.crypto import encrypt

router = APIRouter(prefix="/api/clusters", tags=["clusters"])


def get_owned_cluster(cluster_id: int, db: Session, user: User) -> Cluster:
    cluster = (
        db.query(Cluster)
        .filter(Cluster.id == cluster_id, Cluster.owner_id == user.id)
        .first()
    )
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster introuvable")
    return cluster


def _refresh_status(cluster: Cluster, db: Session) -> None:
    try:
        info = kube.probe(cluster)
        cluster.status = "connected"
        cluster.last_error = None
        cluster.server_url = info.get("server_url")
    except Exception as exc:  # noqa: BLE001
        cluster.status = "error"
        cluster.last_error = str(exc)[:500]
    cluster.last_checked_at = datetime.now(timezone.utc)
    db.commit()


@router.get("", response_model=list[ClusterOut])
def list_clusters(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return (
        db.query(Cluster)
        .filter(Cluster.owner_id == user.id)
        .order_by(Cluster.created_at.asc())
        .all()
    )


@router.post("", response_model=ClusterOut, status_code=201)
def create_cluster(
    payload: ClusterCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    contexts = kube.kubeconfig_contexts(payload.kubeconfig)
    if payload.context and contexts and payload.context not in contexts:
        raise HTTPException(status_code=400, detail=f"Contexte inconnu. Disponibles : {', '.join(contexts)}")

    cluster = Cluster(
        name=payload.name,
        description=payload.description,
        kubeconfig_encrypted=encrypt(payload.kubeconfig),
        context=payload.context,
        color=payload.color or "emerald",
        owner_id=user.id,
    )
    db.add(cluster)
    db.commit()
    db.refresh(cluster)
    _refresh_status(cluster, db)
    db.refresh(cluster)
    return cluster


@router.get("/{cluster_id}", response_model=ClusterOut)
def get_cluster(cluster_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return get_owned_cluster(cluster_id, db, user)


@router.patch("/{cluster_id}", response_model=ClusterOut)
def update_cluster(
    cluster_id: int,
    payload: ClusterUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cluster = get_owned_cluster(cluster_id, db, user)
    if payload.name is not None:
        cluster.name = payload.name
    if payload.description is not None:
        cluster.description = payload.description
    if payload.context is not None:
        cluster.context = payload.context
    if payload.color is not None:
        cluster.color = payload.color
    if payload.kubeconfig is not None:
        cluster.kubeconfig_encrypted = encrypt(payload.kubeconfig)
    db.commit()
    kube.invalidate(cluster.id)
    _refresh_status(cluster, db)
    db.refresh(cluster)
    return cluster


@router.delete("/{cluster_id}", status_code=204)
def delete_cluster(cluster_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cluster = get_owned_cluster(cluster_id, db, user)
    db.delete(cluster)
    db.commit()
    kube.invalidate(cluster_id)


@router.post("/{cluster_id}/test", response_model=ClusterOut)
def test_cluster(cluster_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cluster = get_owned_cluster(cluster_id, db, user)
    kube.invalidate(cluster.id)
    _refresh_status(cluster, db)
    db.refresh(cluster)
    return cluster


@router.get("/{cluster_id}/overview")
def cluster_overview(cluster_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cluster = get_owned_cluster(cluster_id, db, user)
    cc = kube.get_client(cluster)

    version = cc.version.get_code()
    nodes = cc.core.list_node().items
    namespaces = cc.core.list_namespace().items
    pods = cc.core.list_pod_for_all_namespaces().items

    node_summaries = []
    total_cpu = 0.0
    total_mem = 0
    ready_nodes = 0
    for n in nodes:
        conditions = {c.type: c.status for c in (n.status.conditions or [])}
        is_ready = conditions.get("Ready") == "True"
        if is_ready:
            ready_nodes += 1
        cap = n.status.capacity or {}
        cpu = _parse_cpu(cap.get("cpu", "0"))
        mem = _parse_mem(cap.get("memory", "0"))
        total_cpu += cpu
        total_mem += mem
        node_summaries.append(
            {
                "name": n.metadata.name,
                "ready": is_ready,
                "roles": _node_roles(n),
                "kubelet_version": n.status.node_info.kubelet_version if n.status.node_info else None,
                "os_image": n.status.node_info.os_image if n.status.node_info else None,
                "cpu": cap.get("cpu"),
                "memory": cap.get("memory"),
                "internal_ip": _node_internal_ip(n),
            }
        )

    phases: dict[str, int] = {}
    for p in pods:
        phase = p.status.phase or "Unknown"
        phases[phase] = phases.get(phase, 0) + 1

    return {
        "cluster": {"id": cluster.id, "name": cluster.name},
        "version": getattr(version, "git_version", None),
        "platform": getattr(version, "platform", None),
        "counts": {
            "nodes": len(nodes),
            "nodes_ready": ready_nodes,
            "namespaces": len(namespaces),
            "pods": len(pods),
            "deployments": len(cc.apps.list_deployment_for_all_namespaces().items),
            "services": len(cc.core.list_service_for_all_namespaces().items),
        },
        "capacity": {
            "cpu_cores": round(total_cpu, 2),
            "memory_bytes": total_mem,
        },
        "pod_phases": phases,
        "nodes": node_summaries,
    }


def _node_roles(node) -> list[str]:
    roles = []
    for label in (node.metadata.labels or {}):
        if label.startswith("node-role.kubernetes.io/"):
            role = label.split("/", 1)[1]
            roles.append(role or "master")
    return roles or ["worker"]


def _node_internal_ip(node) -> str | None:
    for addr in (node.status.addresses or []):
        if addr.type == "InternalIP":
            return addr.address
    return None


def _parse_cpu(value: str) -> float:
    if not value:
        return 0.0
    if value.endswith("m"):
        return int(value[:-1]) / 1000
    if value.endswith("n"):
        return int(value[:-1]) / 1_000_000_000
    try:
        return float(value)
    except ValueError:
        return 0.0


def _parse_mem(value: str) -> int:
    if not value:
        return 0
    units = {
        "Ki": 1024,
        "Mi": 1024**2,
        "Gi": 1024**3,
        "Ti": 1024**4,
        "K": 1000,
        "M": 1000**2,
        "G": 1000**3,
        "T": 1000**4,
    }
    for suffix, mult in units.items():
        if value.endswith(suffix):
            try:
                return int(float(value[: -len(suffix)]) * mult)
            except ValueError:
                return 0
    try:
        return int(value)
    except ValueError:
        return 0
