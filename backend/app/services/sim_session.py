"""Server-side simulator session lease — auto-stops when heartbeats stop."""
from __future__ import annotations

import os
import secrets
import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.services import sim_control

_lease: SimLease | None = None
_sweeper_task: asyncio.Task | None = None


def session_mode_enabled() -> bool:
    return os.environ.get("SIM_SESSION_MODE", "").strip().lower() in ("1", "true", "yes")


def lease_timeout_sec() -> int:
    try:
        return max(30, int(os.environ.get("SIM_LEASE_TIMEOUT_SEC", "90")))
    except ValueError:
        return 90


@dataclass
class SimLease:
    session_id: str
    started_at: datetime
    last_heartbeat: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def touch(self) -> None:
        self.last_heartbeat = datetime.now(timezone.utc)

    def expired(self, timeout_sec: int) -> bool:
        age = (datetime.now(timezone.utc) - self.last_heartbeat).total_seconds()
        return age > timeout_sec


def get_status() -> dict:
    global _lease
    timeout = lease_timeout_sec()
    if _lease and _lease.expired(timeout):
        _expire_lease()
    active = _lease is not None
    return {
        "active": active,
        "session_id": _lease.session_id if _lease else None,
        "simulator_running": sim_control.is_running(),
        "session_mode": session_mode_enabled(),
        "lease_timeout_sec": timeout,
        "started_at": _lease.started_at.isoformat() if _lease else None,
    }


def _expire_lease() -> None:
    global _lease
    sim_control.stop()
    _lease = None


def start_session() -> dict:
    global _lease
    timeout = lease_timeout_sec()
    if _lease and not _lease.expired(timeout):
        return {
            "session_id": _lease.session_id,
            "expires_in_sec": timeout,
            "already_active": True,
        }
    if _lease:
        _expire_lease()
    session_id = secrets.token_urlsafe(16)
    sim_control.start()
    now = datetime.now(timezone.utc)
    _lease = SimLease(session_id=session_id, started_at=now, last_heartbeat=now)
    return {
        "session_id": session_id,
        "expires_in_sec": timeout,
        "already_active": False,
    }


def heartbeat(session_id: str) -> dict:
    global _lease
    if not _lease or _lease.session_id != session_id:
        raise KeyError("unknown session")
    if _lease.expired(lease_timeout_sec()):
        _expire_lease()
        raise KeyError("session expired")
    _lease.touch()
    return {"ok": True, "expires_in_sec": lease_timeout_sec()}


def stop_session(session_id: str | None = None) -> dict:
    global _lease
    if session_id and _lease and _lease.session_id != session_id:
        raise KeyError("unknown session")
    _expire_lease()
    return {"ok": True, "simulator_running": sim_control.is_running()}


async def lease_sweeper() -> None:
    while True:
        await asyncio.sleep(15)
        global _lease
        if _lease and _lease.expired(lease_timeout_sec()):
            _expire_lease()


async def start_sweeper() -> None:
    global _sweeper_task
    if not session_mode_enabled() or _sweeper_task is not None:
        return
    _sweeper_task = asyncio.create_task(lease_sweeper())


async def stop_sweeper() -> None:
    global _sweeper_task
    if _sweeper_task:
        _sweeper_task.cancel()
        try:
            await _sweeper_task
        except asyncio.CancelledError:
            pass
        _sweeper_task = None
