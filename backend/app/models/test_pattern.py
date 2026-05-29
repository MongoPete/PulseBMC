from pydantic import BaseModel
from typing import Optional


class PatternConfig(BaseModel):
    duration_ms: int
    target_component: str
    parameters: dict = {}


class TestPattern(BaseModel):
    pattern_id: str
    test_type: str
    description: str
    config: PatternConfig
    size_bytes: int = 0
    tags: list[str] = []
    version: str = "1.0"
