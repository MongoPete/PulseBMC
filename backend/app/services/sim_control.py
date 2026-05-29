"""
Simulator process control — lets the backend (and therefore the UI) start, stop,
and restart the loopback simulator (`emit_tests.py`), which stands in for the
fleet management host. The simulator stays a separate process per the architecture;
this module just owns its lifecycle so it's controllable from the browser.
"""
import os
import sys
import signal
import subprocess
from pathlib import Path

# backend/app/services/sim_control.py -> parents[2] == backend/
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_SIM_SCRIPT = _BACKEND_DIR / "simulator" / "emit_tests.py"

DEFAULT_INTERVAL = "6"

_proc: subprocess.Popen | None = None


def is_running() -> bool:
    return _proc is not None and _proc.poll() is None


def start(interval: str = DEFAULT_INTERVAL) -> bool:
    """Spawn the simulator if not already running. Returns True if it started."""
    global _proc
    if is_running():
        return False
    _proc = subprocess.Popen(
        [sys.executable, str(_SIM_SCRIPT), "--interval", interval],
        cwd=str(_BACKEND_DIR),
        env=os.environ.copy(),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return True


def stop() -> bool:
    """Terminate the simulator if running. Returns True if it was stopped."""
    global _proc
    if not is_running():
        _proc = None
        return False
    try:
        _proc.send_signal(signal.SIGINT)  # emit_tests.py handles SIGINT cleanly
        try:
            _proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            _proc.kill()
            _proc.wait(timeout=3)
    except Exception:
        pass
    _proc = None
    return True


def restart(interval: str = DEFAULT_INTERVAL) -> None:
    stop()
    start(interval)
