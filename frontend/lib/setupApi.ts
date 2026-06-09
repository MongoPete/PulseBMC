/** Direct backend URL for local setup wizard (localhost-only endpoints). */
export const BACKEND_SETUP_URL =
  process.env.API_URL ?? "http://localhost:8000";

export interface SetupConfigPayload {
  atlas_uri: string;
  openai_api_key: string;
  voyage_api_key: string;
  grove_api_key?: string;
  grove_base_url?: string;
  grove_model?: string;
  backend_api_key?: string;
  allowed_origins?: string;
}

export interface SetupStatus {
  complete: boolean;
  missing_fields: string[];
  setup_allowed: boolean;
}

export interface SetupTestResult {
  atlas: boolean;
  atlas_message: string;
  openai: boolean | null;
  openai_message: string;
  voyage: boolean | null;
  voyage_message: string;
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  const res = await fetch(`${BACKEND_SETUP_URL}/api/setup/status`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Setup status → ${res.status}`);
  return res.json();
}

export async function testSetup(config: SetupConfigPayload): Promise<SetupTestResult> {
  const res = await fetch(`${BACKEND_SETUP_URL}/api/setup/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Test failed → ${res.status}`);
  }
  return res.json();
}

export async function saveBackendSetup(config: SetupConfigPayload): Promise<{ backend_api_key: string }> {
  const res = await fetch(`${BACKEND_SETUP_URL}/api/setup/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === "string" ? err.detail : `Save failed → ${res.status}`);
  }
  return res.json();
}

export async function runBackendSeed(): Promise<{ ok: boolean; output: string }> {
  const res = await fetch(`${BACKEND_SETUP_URL}/api/setup/seed`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === "string" ? err.detail : `Seed failed → ${res.status}`);
  }
  return res.json();
}

export async function saveFrontendSetup(payload: {
  auth_secret: string;
  demo_user: string;
  demo_user_password: string;
  backend_api_key: string;
}): Promise<void> {
  const res = await fetch("/api/setup/local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Frontend save failed → ${res.status}`);
  }
}
