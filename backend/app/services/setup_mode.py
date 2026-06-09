"""Local-first-run setup wizard helpers (localhost + ALLOW_SETUP only)."""
from __future__ import annotations

import os
import secrets
import subprocess
import sys
from pathlib import Path

import httpx
import pymongo
from pydantic import BaseModel, Field

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_ENV_PATH = _BACKEND_DIR / ".env"
_SEED_SCRIPT = _BACKEND_DIR / "seed" / "seed_data.py"


class SetupConfig(BaseModel):
    atlas_uri: str = Field(min_length=1)
    openai_api_key: str = ""
    voyage_api_key: str = ""
    grove_api_key: str = ""
    grove_base_url: str = ""
    grove_model: str = "gpt-5.5"
    backend_api_key: str = ""
    allowed_origins: str = "http://localhost:3000"


class SetupTestResult(BaseModel):
    atlas: bool
    atlas_message: str
    openai: bool | None = None
    openai_message: str = ""
    voyage: bool | None = None
    voyage_message: str = ""


def is_setup_complete() -> bool:
    uri = os.environ.get("ATLAS_URI", "").strip()
    if not uri:
        return False
    placeholders = ("USER:PASS", "://USER@", "changeme", "your_")
    lower = uri.lower()
    return not any(p.lower() in lower for p in placeholders)


def _allow_setup_flag() -> bool:
    return os.environ.get("ALLOW_SETUP", "").strip().lower() in ("1", "true", "yes")


def is_deployed() -> bool:
    return bool(os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("VERCEL"))


def is_setup_allowed(*, reset: bool = False) -> bool:
    if is_deployed():
        return False
    if not _allow_setup_flag():
        return False
    if is_setup_complete() and not reset:
        if os.environ.get("ALLOW_SETUP_RESET", "").strip().lower() not in ("1", "true", "yes"):
            return False
    return True


def is_localhost_host(host: str | None) -> bool:
    if not host:
        return False
    bare = host.split(":")[0]
    return bare in ("127.0.0.1", "localhost", "::1")


def missing_fields() -> list[str]:
    missing: list[str] = []
    if not os.environ.get("ATLAS_URI", "").strip():
        missing.append("ATLAS_URI")
    has_grove = bool(os.environ.get("GROVE_API_KEY", "").strip() and os.environ.get("GROVE_BASE_URL", "").strip())
    if not has_grove and not os.environ.get("OPENAI_API_KEY", "").strip():
        missing.append("OPENAI_API_KEY")
    if not os.environ.get("VOYAGE_API_KEY", "").strip():
        missing.append("VOYAGE_API_KEY")
    return missing


def _test_atlas(uri: str) -> tuple[bool, str]:
    try:
        client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=8000)
        client.admin.command("ping")
        client.close()
        return True, "Connected to MongoDB Atlas"
    except Exception as e:
        return False, str(e)


def _test_openai(api_key: str) -> tuple[bool, str]:
    if not api_key.strip():
        return False, "OPENAI_API_KEY is empty"
    try:
        with httpx.Client(timeout=15.0) as client:
            res = client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
        if res.status_code == 200:
            return True, "OpenAI API key accepted"
        return False, f"OpenAI returned HTTP {res.status_code}"
    except Exception as e:
        return False, str(e)


def _test_grove(api_key: str, base_url: str) -> tuple[bool, str]:
    if not api_key.strip() or not base_url.strip():
        return False, "GROVE_API_KEY and GROVE_BASE_URL are required for Grove mode"
    try:
        url = base_url.rstrip("/") + "/models"
        with httpx.Client(timeout=15.0) as client:
            res = client.get(url, headers={"api-key": api_key})
        if res.status_code in (200, 404):
            return True, "Grove gateway reachable"
        return False, f"Grove returned HTTP {res.status_code}"
    except Exception as e:
        return False, str(e)


def _test_voyage(api_key: str) -> tuple[bool, str]:
    if not api_key.strip():
        return False, "VOYAGE_API_KEY is empty"
    try:
        import voyageai

        client = voyageai.Client(api_key=api_key)
        client.embed(["connectivity test"], model="voyage-4-large", input_type="document")
        return True, "Voyage AI embeddings OK"
    except Exception as e:
        return False, str(e)


def test_connections(config: SetupConfig) -> SetupTestResult:
    atlas_ok, atlas_msg = _test_atlas(config.atlas_uri)

    has_grove = bool(config.grove_api_key.strip() and config.grove_base_url.strip())
    if has_grove:
        openai_ok, openai_msg = _test_grove(config.grove_api_key, config.grove_base_url)
    else:
        openai_ok, openai_msg = _test_openai(config.openai_api_key)

    voyage_ok, voyage_msg = _test_voyage(config.voyage_api_key)

    return SetupTestResult(
        atlas=atlas_ok,
        atlas_message=atlas_msg,
        openai=openai_ok,
        openai_message=openai_msg,
        voyage=voyage_ok,
        voyage_message=voyage_msg,
    )


def _env_lines(config: SetupConfig) -> tuple[list[str], str]:
    api_key = config.backend_api_key.strip() or secrets.token_urlsafe(32)
    lines = [
        f"ATLAS_URI={config.atlas_uri.strip()}",
        f"ALLOWED_ORIGINS={config.allowed_origins.strip() or 'http://localhost:3000'}",
        f"BACKEND_API_KEY={api_key}",
        "ALLOW_SETUP=true",
    ]
    if config.grove_api_key.strip() and config.grove_base_url.strip():
        lines.append(f"GROVE_API_KEY={config.grove_api_key.strip()}")
        lines.append(f"GROVE_BASE_URL={config.grove_base_url.strip()}")
        if config.grove_model.strip():
            lines.append(f"GROVE_MODEL={config.grove_model.strip()}")
    elif config.openai_api_key.strip():
        lines.append(f"OPENAI_API_KEY={config.openai_api_key.strip()}")
    if config.voyage_api_key.strip():
        lines.append(f"VOYAGE_API_KEY={config.voyage_api_key.strip()}")
    return lines, api_key


def save_backend_env(config: SetupConfig) -> dict:
    lines, api_key = _env_lines(config)
    tmp = _ENV_PATH.with_suffix(".env.tmp")
    tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    tmp.replace(_ENV_PATH)
    for line in lines:
        key, _, val = line.partition("=")
        os.environ[key] = val
    return {"backend_api_key": api_key, "env_path": str(_ENV_PATH)}


def run_seed_subprocess() -> dict:
    if not is_setup_complete():
        return {"ok": False, "output": "ATLAS_URI not configured. Save setup and restart first."}
    proc = subprocess.run(
        [sys.executable, str(_SEED_SCRIPT)],
        cwd=str(_BACKEND_DIR),
        capture_output=True,
        text=True,
        env=os.environ.copy(),
        timeout=600,
    )
    output = (proc.stdout or "") + (proc.stderr or "")
    return {"ok": proc.returncode == 0, "output": output.strip()}
