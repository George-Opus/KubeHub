"""Streaming temps réel : logs de pods et terminal exec (WebSocket)."""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from kubernetes import stream as k8s_stream
from sqlalchemy.orm import Session

from app.auth.security import decode_access_token
from app.database import SessionLocal
from app.models import Cluster, User
from app.services import kube

router = APIRouter(prefix="/api/clusters/{cluster_id}", tags=["stream"])


def _authorize(cluster_id: int, token: str | None) -> Cluster | None:
    if not token:
        return None
    username = decode_access_token(token)
    if not username:
        return None
    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            return None
        cluster = (
            db.query(Cluster)
            .filter(Cluster.id == cluster_id, Cluster.owner_id == user.id)
            .first()
        )
        if not cluster:
            return None
        # Détache l'objet pour usage hors session.
        db.expunge(cluster)
        return cluster
    finally:
        db.close()


@router.websocket("/pods/{namespace}/{pod}/logs")
async def pod_logs(
    websocket: WebSocket,
    cluster_id: int,
    namespace: str,
    pod: str,
    token: str | None = None,
    container: str | None = None,
    tail: int = 500,
):
    cluster = _authorize(cluster_id, token)
    if not cluster:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    loop = asyncio.get_event_loop()
    resp = None
    try:
        cc = kube.get_client(cluster)
        resp = await loop.run_in_executor(
            None,
            lambda: cc.core.read_namespaced_pod_log(
                name=pod,
                namespace=namespace,
                container=container,
                follow=True,
                tail_lines=tail,
                _preload_content=False,
            ),
        )

        while True:
            line = await loop.run_in_executor(None, resp.readline)
            if not line:
                break
            await websocket.send_text(line.decode("utf-8", errors="replace"))
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        try:
            await websocket.send_text(f"\n[kubehub] erreur : {exc}\n")
        except Exception:
            pass
    finally:
        if resp is not None:
            try:
                resp.release_conn()
            except Exception:
                pass
        try:
            await websocket.close()
        except Exception:
            pass


@router.websocket("/pods/{namespace}/{pod}/exec")
async def pod_exec(
    websocket: WebSocket,
    cluster_id: int,
    namespace: str,
    pod: str,
    token: str | None = None,
    container: str | None = None,
    shell: str = "/bin/sh",
):
    cluster = _authorize(cluster_id, token)
    if not cluster:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    loop = asyncio.get_event_loop()

    def _open():
        cc = kube.get_client(cluster)
        kwargs = dict(
            command=[shell],
            stderr=True,
            stdin=True,
            stdout=True,
            tty=True,
            _preload_content=False,
        )
        if container:
            kwargs["container"] = container
        return k8s_stream.stream(
            cc.core.connect_get_namespaced_pod_exec,
            pod,
            namespace,
            **kwargs,
        )

    try:
        resp = await loop.run_in_executor(None, _open)
    except Exception as exc:  # noqa: BLE001
        await websocket.send_text(f"[kubehub] impossible d'ouvrir le shell : {exc}\r\n")
        await websocket.close()
        return

    stop = asyncio.Event()

    async def pump_output():
        try:
            while not stop.is_set() and resp.is_open():
                resp.update(timeout=1)
                if resp.peek_stdout():
                    await websocket.send_text(resp.read_stdout())
                if resp.peek_stderr():
                    await websocket.send_text(resp.read_stderr())
                await asyncio.sleep(0.01)
        except Exception:
            pass
        finally:
            stop.set()

    output_task = asyncio.create_task(pump_output())

    try:
        while not stop.is_set():
            msg = await websocket.receive_text()
            try:
                data = json.loads(msg)
            except json.JSONDecodeError:
                data = {"type": "input", "data": msg}

            if data.get("type") == "resize":
                try:
                    resp.write_channel(
                        4,
                        json.dumps({"Width": data.get("cols", 80), "Height": data.get("rows", 24)}),
                    )
                except Exception:
                    pass
            else:
                resp.write_stdin(data.get("data", ""))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        stop.set()
        output_task.cancel()
        try:
            resp.close()
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass
