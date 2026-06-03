from pydantic import BaseModel, Field
from datetime import datetime
from typing import Any


class TelemetryMeta(BaseModel):
    device_id: str
    sensor_type: str = "thermal"  # thermal | pcie | power | memory | network


class TelemetryCreate(BaseModel):
    ts: datetime = Field(default_factory=datetime.utcnow)
    meta: TelemetryMeta
    # Flexible subdoc — schema intentionally varies by sensor_type.
    # thermal: { baseline_temp_c, in_degradation, degradation_phase_remaining }
    # pcie:    { link_width, error_count }
    # network: { nic_status, packet_loss_rate }
    readings: dict[str, Any]
