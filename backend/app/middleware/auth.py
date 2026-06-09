import os
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


class APIKeyMiddleware(BaseHTTPMiddleware):
    """Require BACKEND_API_KEY on /api/* when the env var is set."""

    async def dispatch(self, request: Request, call_next):
        api_key = os.environ.get("BACKEND_API_KEY", "").strip()
        if not api_key:
            return await call_next(request)

        path = request.url.path
        if path == "/health":
            return await call_next(request)

        if path.startswith("/api/setup/"):
            return await call_next(request)

        if path.startswith("/api/"):
            auth = request.headers.get("Authorization", "")
            x_key = request.headers.get("X-API-Key", "")
            token = request.query_params.get("token", "")
            if (
                auth == f"Bearer {api_key}"
                or x_key == api_key
                or token == api_key
            ):
                return await call_next(request)
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)

        return await call_next(request)
