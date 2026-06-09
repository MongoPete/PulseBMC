import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.db import ensure_indexes, close_client
from app.routes import devices, test_runs, alerts, agents, demo, explore, telemetry, setup
from app.services import sim_control
from app.services.setup_mode import is_setup_complete
from app.middleware.auth import APIKeyMiddleware


def _allowed_origins() -> list[str]:
    raw = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000")
    return [o.strip() for o in raw.split(",") if o.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    if is_setup_complete():
        await ensure_indexes()
    yield
    sim_control.stop()
    if is_setup_complete():
        await close_client()


app = FastAPI(title="SoCPulse API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(APIKeyMiddleware)

app.include_router(devices.router, prefix="/api")
app.include_router(test_runs.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(demo.router, prefix="/api")
app.include_router(explore.router, prefix="/api")
app.include_router(telemetry.router, prefix="/api")
app.include_router(setup.router, prefix="/api")


@app.get("/health")
async def health():
    setup_required = not is_setup_complete()
    return {"status": "ok", "setup_required": setup_required}
