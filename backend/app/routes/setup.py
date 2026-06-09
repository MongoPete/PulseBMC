from fastapi import APIRouter, HTTPException, Request

from app.services.setup_mode import (
    SetupConfig,
    is_localhost_host,
    is_setup_allowed,
    is_setup_complete,
    missing_fields,
    run_seed_subprocess,
    save_backend_env,
    test_connections,
)

router = APIRouter(prefix="/setup", tags=["setup"])


def _guard_setup(request: Request, *, reset: bool = False) -> None:
    if not is_localhost_host(request.client.host if request.client else None):
        raise HTTPException(status_code=403, detail="Setup is localhost-only")
    if not is_setup_allowed(reset=reset):
        raise HTTPException(status_code=403, detail="Setup wizard is disabled")


@router.get("/status")
async def setup_status(request: Request):
    _guard_setup(request, reset=True)
    complete = is_setup_complete()
    return {
        "complete": complete,
        "missing_fields": [] if complete else missing_fields(),
        "setup_allowed": is_setup_allowed(reset=True),
    }


@router.post("/test")
async def setup_test(request: Request, config: SetupConfig):
    _guard_setup(request, reset=True)
    result = test_connections(config)
    return result.model_dump()


@router.post("/save")
async def setup_save(request: Request, config: SetupConfig):
    _guard_setup(request, reset=not is_setup_complete())
    result = test_connections(config)
    if not result.atlas:
        raise HTTPException(status_code=400, detail=f"Atlas: {result.atlas_message}")
    has_grove = bool(config.grove_api_key.strip() and config.grove_base_url.strip())
    if has_grove:
        if not result.openai:
            raise HTTPException(status_code=400, detail=f"Grove: {result.openai_message}")
    elif not result.openai:
        raise HTTPException(status_code=400, detail=f"OpenAI: {result.openai_message}")
    if not result.voyage:
        raise HTTPException(status_code=400, detail=f"Voyage: {result.voyage_message}")

    saved = save_backend_env(config)
    return {
        "ok": True,
        "backend_api_key": saved["backend_api_key"],
        "message": "backend/.env saved. Restart ./start.sh, then seed the database.",
    }


@router.post("/seed")
async def setup_seed(request: Request):
    _guard_setup(request, reset=True)
    if not is_setup_complete():
        raise HTTPException(
            status_code=400,
            detail="Setup incomplete. Save credentials and restart ./start.sh before seeding.",
        )
    result = run_seed_subprocess()
    if not result["ok"]:
        raise HTTPException(status_code=500, detail=result["output"] or "Seed failed")
    return result
