from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal


class CoreResult(BaseModel):
    core_id: str
    result: Literal["pass", "fail"]
    latency_ms: Optional[float] = None


class ComponentResult(BaseModel):
    component_id: str
    result: Literal["pass", "fail"]
    error_code: Optional[str] = None
    core_results: list[CoreResult] = []


class TestResults(BaseModel):
    overall: Literal["pass", "fail"]
    components: list[ComponentResult] = []


class TestRun(BaseModel):
    device_id: str
    pattern_id: str
    started_at: datetime
    completed_at: datetime
    duration_ms: int
    status: Literal["pass", "fail"]
    led_state: Literal["green", "flashing_green", "red"]
    results: TestResults
    triggered_by: str = "simulator"

    # Embedding fields — populated asynchronously after insert for failed runs
    embedding_text: Optional[str] = None
    embedding: Optional[list[float]] = None
    embedding_model: Optional[str] = None
    embedded_at: Optional[datetime] = None


class TestRunCreate(BaseModel):
    device_id: str
    pattern_id: str
    started_at: datetime
    completed_at: datetime
    duration_ms: int
    status: Literal["pass", "fail"]
    led_state: Literal["green", "flashing_green", "red"]
    results: TestResults
    triggered_by: str = "simulator"
