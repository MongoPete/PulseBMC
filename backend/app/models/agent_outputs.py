from pydantic import BaseModel, Field
from datetime import datetime
from typing import Literal, Optional, Any


class AtRiskComponent(BaseModel):
    component_id: str
    failure_rate: float
    error_codes: list[str]
    similar_incident_ids: list[str] = []


class FailurePrediction(BaseModel):
    device_id: str
    at_risk_components: list[AtRiskComponent]
    confidence_score: float
    supporting_evidence: list[str]
    recommended_action: str


class RootCauseAnalysis(BaseModel):
    alert_id: str
    root_cause_hypothesis: str
    evidence: list[str]
    confidence: float
    alternative_hypotheses: list[str]
    next_diagnostic_steps: list[str]
    retrieved_context_summary: str = ""


class WorkOrder(BaseModel):
    title: str
    priority: Literal["P1", "P2", "P3", "P4"]
    assigned_technician: str
    repair_steps: list[str]
    estimated_duration_minutes: int
    required_parts: list[str]
    safety_notes: list[str]
    historical_basis: str = ""
    originating_alert_id: str
    test_run_ids: list[str] = []
    retrieved_incident_ids: list[str] = []


class AgentChainResult(BaseModel):
    prediction: FailurePrediction
    root_cause: RootCauseAnalysis
    work_order: WorkOrder
    agent_run_id: str


class RetrievedDoc(BaseModel):
    collection: str
    doc_id: str
    similarity: Optional[float] = None
    summary: str = ""


class AgentRun(BaseModel):
    agent_type: str
    triggered_by: str
    input_context: dict[str, Any]
    retrieved_documents: list[RetrievedDoc] = []
    tool_calls: list[dict[str, Any]] = []
    llm_output: dict[str, Any]
    duration_ms: int
    model: str = "gpt-5.5"
    created_at: datetime = Field(default_factory=datetime.utcnow)
