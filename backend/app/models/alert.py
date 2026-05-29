from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal


class Alert(BaseModel):
    device_id: str
    rule_id: str = "failure_rate_threshold"
    triggered_at: datetime = Field(default_factory=datetime.utcnow)
    severity: Literal["low", "medium", "high", "critical"] = "high"
    summary: str
    linked_test_runs: list[str] = []
    status: Literal["open", "acknowledged", "resolved"] = "open"
    failure_rate: float

    # Embedding fields
    embedding_text: Optional[str] = None
    embedding: Optional[list[float]] = None
    embedding_model: Optional[str] = None
    embedded_at: Optional[datetime] = None
