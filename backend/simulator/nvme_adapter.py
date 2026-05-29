"""
NvmeAdapter — simulates nvme-cli smart-log and error-log output per device.

Values correlate with the simulator's internal degradation state so that
the telemetry tells the same story as the LED: rising media errors, elevated
temperature, and growing error log entries during degradation windows.

Output shapes match real `nvme smart-log --output-format=json` and
`nvme error-log --output-format=json` output.
"""
import random


class NvmeAdapter:
    """Per-device simulated NVMe telemetry. Instantiate once; call per test run."""

    def __init__(self):
        # Accumulated counters that grow monotonically per device
        self._power_on_hours: dict[str, int] = {}
        self._power_cycles: dict[str, int] = {}
        self._unsafe_shutdowns: dict[str, int] = {}
        self._media_errors: dict[str, int] = {}
        self._num_err_log_entries: dict[str, int] = {}
        self._data_units_written: dict[str, int] = {}
        self._data_units_read: dict[str, int] = {}
        self._percentage_used: dict[str, int] = {}

    def _init_device(self, device_id: str):
        if device_id in self._power_on_hours:
            return
        num = int(device_id.split("-")[-1]) if "-" in device_id else 0
        # Stagger starting values so devices look like they have different lifespans
        self._power_on_hours[device_id] = 7000 + num * 312 + random.randint(0, 200)
        self._power_cycles[device_id] = 40 + num * 3 + random.randint(0, 5)
        self._unsafe_shutdowns[device_id] = random.randint(0, 4)
        self._media_errors[device_id] = 0
        self._num_err_log_entries[device_id] = 0
        self._data_units_written[device_id] = random.randint(800_000, 2_000_000)
        self._data_units_read[device_id] = random.randint(1_500_000, 4_000_000)
        self._percentage_used[device_id] = 2 + (num % 8)

    def smart_log(self, device_id: str, degrading: bool, temp_c: float) -> dict:
        """
        Return an nvme-cli smart-log shaped dict for this device.

        During degradation:
          - media_errors and num_err_log_entries accumulate
          - available_spare decreases slightly
          - critical_warning may be set if temp exceeds 85°C
        """
        self._init_device(device_id)

        # Advance power-on hours by ~10 minutes per test cycle
        self._power_on_hours[device_id] += random.randint(0, 1)

        # Accumulate wear during degradation
        if degrading:
            if random.random() < 0.55:
                self._media_errors[device_id] += random.randint(1, 2)
            if random.random() < 0.60:
                self._num_err_log_entries[device_id] += random.randint(1, 3)
            if random.random() < 0.10:
                self._percentage_used[device_id] = min(
                    100, self._percentage_used[device_id] + 1
                )

        available_spare = max(5, 100 - self._percentage_used[device_id] - (5 if degrading else 0))
        critical_warning = 1 if temp_c > 85.0 else 0

        self._data_units_written[device_id] += random.randint(100, 800)
        self._data_units_read[device_id] += random.randint(200, 1200)

        return {
            "critical_warning": critical_warning,
            "temperature": round(temp_c),
            "available_spare": available_spare,
            "available_spare_threshold": 10,
            "percentage_used": self._percentage_used[device_id],
            "data_units_read": self._data_units_read[device_id],
            "data_units_written": self._data_units_written[device_id],
            "host_read_commands": self._data_units_read[device_id] * 4,
            "host_write_commands": self._data_units_written[device_id] * 2,
            "controller_busy_time": self._power_on_hours[device_id] * 18,
            "power_cycles": self._power_cycles[device_id],
            "power_on_hours": self._power_on_hours[device_id],
            "unsafe_shutdowns": self._unsafe_shutdowns[device_id],
            "media_errors": self._media_errors[device_id],
            "num_err_log_entries": self._num_err_log_entries[device_id],
        }

    def error_log(self, device_id: str, failed: bool) -> list[dict]:
        """
        Return an nvme-cli error-log shaped list.
        Generates 0–3 error entries when the test run failed.
        """
        if not failed:
            return []

        self._init_device(device_id)
        n = random.randint(1, 3)
        entries = []
        base_count = self._num_err_log_entries.get(device_id, 0)
        error_types = [
            ("PCIe link training timeout", 0x04),
            ("uncorrectable internal error", 0x06),
            ("media not ready", 0x02),
            ("namespace not ready", 0x0B),
            ("command aborted due to power loss", 0x0C),
        ]
        for i in range(n):
            desc, status = random.choice(error_types)
            entries.append({
                "error_count": base_count + i,
                "sqid": 0,
                "cmdid": random.randint(1, 512),
                "status_field": status,
                "parm_error_location": {"byte": random.randint(0, 15), "bit": random.randint(0, 7)},
                "lba": random.randint(0, 0xFFFFFFFF),
                "nsid": 1,
                "vs": 0,
                "trtype": "PCIe",
                "cs": 0,
                "trtype_spec_info": 0,
                "description": desc,
            })
        return entries
