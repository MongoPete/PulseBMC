from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class Location(BaseModel):
    datacenter: str
    rack: str
    slot: int


class Hardware(BaseModel):
    bmc_arch: str = "ARM64"
    cpu_cores: int = 2
    memory_gb: int = 2
    storage_types: list[str] = ["eMMC"]


class Device(BaseModel):
    device_id: str
    hostname: str
    location: Location
    hardware: Hardware
    status: str = "online"  # online | offline | maintenance
    registered_at: datetime = Field(default_factory=datetime.utcnow)
    last_seen: datetime = Field(default_factory=datetime.utcnow)


class DeviceCreate(BaseModel):
    device_id: str
    hostname: str
    location: Location
    hardware: Hardware
    status: str = "online"
