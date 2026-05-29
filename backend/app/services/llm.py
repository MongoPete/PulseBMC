"""
LLM factory — centralises ChatOpenAI configuration.

Supports two modes (determined by env vars at startup):
  1. Grove gateway  — uses GROVE_API_KEY + GROVE_BASE_URL (api-key header, Azure-style)
  2. Direct OpenAI  — uses OPENAI_API_KEY (fallback)

The grove gateway sends 'api-key: <key>' instead of 'Authorization: Bearer <key>',
so we inject a custom httpx client with that header.
"""
import os
import httpx
from functools import lru_cache
from langchain_openai import ChatOpenAI


@lru_cache(maxsize=4)
def get_llm(model: str | None = None, temperature: float = 0.0) -> ChatOpenAI:
    grove_key = os.environ.get("GROVE_API_KEY", "").strip()
    grove_url = os.environ.get("GROVE_BASE_URL", "").strip()
    grove_model = os.environ.get("GROVE_MODEL", "gpt-5.5").strip()

    resolved_model = model or grove_model

    if grove_key and grove_url:
        # Grove gateway — inject api-key header; suppress Bearer token entirely
        headers = {"api-key": grove_key}
        return ChatOpenAI(
            model=resolved_model,
            temperature=temperature,
            openai_api_key=grove_key,
            openai_api_base=grove_url,
            http_client=httpx.Client(headers=headers, timeout=60.0),
            http_async_client=httpx.AsyncClient(headers=headers, timeout=60.0),
        )

    # Fallback: standard OpenAI key
    return ChatOpenAI(
        model=resolved_model,
        temperature=temperature,
        openai_api_key=os.environ.get("OPENAI_API_KEY", ""),
    )
