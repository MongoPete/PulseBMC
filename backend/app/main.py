from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.db import ensure_indexes, close_client
from app.routes import devices, test_runs, alerts, agents, demo, explore, telemetry
from app.services import sim_control


@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_indexes()
    yield
    sim_control.stop()
    await close_client()


app = FastAPI(title="SoCPulse API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices.router, prefix="/api")
app.include_router(test_runs.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(demo.router, prefix="/api")
app.include_router(explore.router, prefix="/api")
app.include_router(telemetry.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
