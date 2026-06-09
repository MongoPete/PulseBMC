"use client";

import { useCallback, useState } from "react";
import { BrandLockup } from "@/components/Brand";
import { SIEMENS_PETROL, SIEMENS_DARK } from "@/lib/theme";
import {
  runBackendSeed,
  saveBackendSetup,
  testSetup,
  type SetupTestResult,
} from "@/lib/setupApi";

type Step = 1 | 2 | 3 | 4;

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Atlas" },
  { n: 2, label: "AI keys" },
  { n: 3, label: "Login" },
  { n: 4, label: "Save" },
];

export default function SetupPage() {
  const [step, setStep] = useState<Step>(1);
  const [atlasUri, setAtlasUri] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [voyageKey, setVoyageKey] = useState("");
  const [showGrove, setShowGrove] = useState(false);
  const [groveKey, setGroveKey] = useState("");
  const [groveUrl, setGroveUrl] = useState("");
  const [groveModel, setGroveModel] = useState("gpt-5.5");
  const [demoUser, setDemoUser] = useState("");
  const [demoPassword, setDemoPassword] = useState("");
  const [testResult, setTestResult] = useState<SetupTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [authSecret, setAuthSecret] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [seedOutput, setSeedOutput] = useState("");
  const [error, setError] = useState("");

  const config = useCallback(
    () => ({
      atlas_uri: atlasUri.trim(),
      openai_api_key: openaiKey.trim(),
      voyage_api_key: voyageKey.trim(),
      grove_api_key: groveKey.trim(),
      grove_base_url: groveUrl.trim(),
      grove_model: groveModel.trim(),
      allowed_origins: "http://localhost:3000",
    }),
    [atlasUri, openaiKey, voyageKey, groveKey, groveUrl, groveModel],
  );

  const onTest = async () => {
    setTesting(true);
    setError("");
    setTestResult(null);
    try {
      const result = await testSetup(config());
      setTestResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    try {
      const backend = await saveBackendSetup(config());
      const frontend = await fetch("/api/setup/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demo_user: demoUser.trim(),
          demo_user_password: demoPassword,
          backend_api_key: backend.backend_api_key,
        }),
      });
      if (!frontend.ok) {
        const err = await frontend.json().catch(() => ({}));
        throw new Error(err.detail ?? "Frontend save failed");
      }
      const feData = await frontend.json();
      setAuthSecret(feData.auth_secret ?? "");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onSeed = async () => {
    setSeeding(true);
    setError("");
    setSeedOutput("");
    try {
      const result = await runBackendSeed();
      setSeedOutput(result.output);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed — restart ./start.sh first");
    } finally {
      setSeeding(false);
    }
  };

  const inputClass =
    "w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 font-mono";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: "#F4F7F9" }}>
      <div className="w-full max-w-2xl">
        <div className="flex justify-center mb-6">
          <BrandLockup wordmarkClass="text-lg" siemensSize={18} />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="h-1" style={{ background: SIEMENS_PETROL }} />
          <div className="px-6 py-6">
            <h1 className="text-lg font-bold text-slate-900">First-run setup</h1>
            <p className="text-xs text-slate-500 mt-1">
              Connect MongoDB Atlas and AI services — local redeploy only. Keys are written to{" "}
              <span className="font-mono">backend/.env</span> and{" "}
              <span className="font-mono">frontend/.env.local</span>, never stored in the browser.
            </p>

            {/* Step indicator */}
            <div className="flex gap-2 mt-5 mb-6">
              {STEPS.map((s) => (
                <button
                  key={s.n}
                  type="button"
                  onClick={() => !saved && setStep(s.n)}
                  className={`flex-1 text-[11px] font-semibold py-2 rounded-lg border transition-colors ${
                    step === s.n
                      ? "text-white border-transparent"
                      : "text-slate-500 border-slate-200 bg-slate-50 hover:bg-slate-100"
                  }`}
                  style={step === s.n ? { background: SIEMENS_PETROL } : {}}
                >
                  {s.n}. {s.label}
                </button>
              ))}
            </div>

            {!saved ? (
              <>
                {step === 1 && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        ATLAS_URI <span className="font-normal text-slate-400">— MongoDB connection string (≈ SQL server + database)</span>
                      </label>
                      <input
                        type="password"
                        value={atlasUri}
                        onChange={(e) => setAtlasUri(e.target.value)}
                        className={inputClass}
                        placeholder="mongodb+srv://USER:PASS@cluster.mongodb.net/pulse_bmc"
                        autoComplete="off"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!atlasUri.trim()}
                      onClick={() => setStep(2)}
                      className="text-sm font-semibold text-white rounded-lg px-4 py-2 disabled:opacity-50"
                      style={{ background: SIEMENS_PETROL }}
                    >
                      Next: AI keys
                    </button>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">OPENAI_API_KEY</label>
                      <input
                        type="password"
                        value={openaiKey}
                        onChange={(e) => setOpenaiKey(e.target.value)}
                        className={inputClass}
                        placeholder="sk-..."
                        autoComplete="off"
                        disabled={showGrove}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        VOYAGE_API_KEY <span className="font-normal text-slate-400">— embeddings for vector search (≈ SQL full-text index backend)</span>
                      </label>
                      <input
                        type="password"
                        value={voyageKey}
                        onChange={(e) => setVoyageKey(e.target.value)}
                        className={inputClass}
                        placeholder="pa-..."
                        autoComplete="off"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowGrove(!showGrove)}
                      className="text-[11px] text-slate-500 underline"
                    >
                      {showGrove ? "Hide" : "Use"} Grove gateway instead of OpenAI
                    </button>
                    {showGrove && (
                      <div className="space-y-2 pl-3 border-l-2 border-slate-200">
                        <input
                          type="password"
                          value={groveKey}
                          onChange={(e) => setGroveKey(e.target.value)}
                          className={inputClass}
                          placeholder="GROVE_API_KEY"
                          autoComplete="off"
                        />
                        <input
                          type="text"
                          value={groveUrl}
                          onChange={(e) => setGroveUrl(e.target.value)}
                          className={inputClass}
                          placeholder="GROVE_BASE_URL"
                          autoComplete="off"
                        />
                        <input
                          type="text"
                          value={groveModel}
                          onChange={(e) => setGroveModel(e.target.value)}
                          className={inputClass}
                          placeholder="GROVE_MODEL"
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setStep(1)} className="text-sm text-slate-600 px-4 py-2 border rounded-lg">
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setStep(3)}
                        className="text-sm font-semibold text-white rounded-lg px-4 py-2"
                        style={{ background: SIEMENS_PETROL }}
                      >
                        Next: Login
                      </button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-3">
                    <p className="text-[11px] text-slate-500">
                      Dashboard sign-in credentials (stored in frontend/.env.local — not your Atlas password).
                    </p>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Demo user email</label>
                      <input
                        type="email"
                        value={demoUser}
                        onChange={(e) => setDemoUser(e.target.value)}
                        className={inputClass}
                        placeholder="demo@yourcompany.com"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Demo user password</label>
                      <input
                        type="password"
                        value={demoPassword}
                        onChange={(e) => setDemoPassword(e.target.value)}
                        className={inputClass}
                        placeholder="Choose a password"
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setStep(2)} className="text-sm text-slate-600 px-4 py-2 border rounded-lg">
                        Back
                      </button>
                      <button
                        type="button"
                        disabled={!demoUser.trim() || !demoPassword}
                        onClick={() => setStep(4)}
                        className="text-sm font-semibold text-white rounded-lg px-4 py-2 disabled:opacity-50"
                        style={{ background: SIEMENS_PETROL }}
                      >
                        Next: Validate &amp; save
                      </button>
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-4">
                    <p className="text-[11px] text-slate-500">
                      Test connectivity before writing files. After save, restart the stack with{" "}
                      <span className="font-mono">./start.sh</span>.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={onTest}
                        disabled={testing}
                        className="text-sm font-semibold text-white rounded-lg px-4 py-2 disabled:opacity-60"
                        style={{ background: SIEMENS_DARK }}
                      >
                        {testing ? "Testing…" : "Test connection"}
                      </button>
                      <button
                        type="button"
                        onClick={onSave}
                        disabled={saving}
                        className="text-sm font-semibold text-white rounded-lg px-4 py-2 disabled:opacity-60"
                        style={{ background: SIEMENS_PETROL }}
                      >
                        {saving ? "Saving…" : "Save & continue"}
                      </button>
                    </div>

                    {testResult && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 text-[11px]">
                        <ResultRow ok={testResult.atlas} label="MongoDB Atlas" message={testResult.atlas_message} />
                        {testResult.openai !== null && (
                          <ResultRow ok={!!testResult.openai} label="LLM (OpenAI/Grove)" message={testResult.openai_message} />
                        )}
                        {testResult.voyage !== null && (
                          <ResultRow ok={!!testResult.voyage} label="Voyage AI" message={testResult.voyage_message} />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
              </>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                  Setup files saved. Restart the stack, then seed the database.
                </div>
                <ol className="list-decimal list-inside text-[11px] text-slate-600 space-y-1">
                  <li>Stop the running stack (Ctrl+C in the terminal running <span className="font-mono">./start.sh</span>)</li>
                  <li>Run <span className="font-mono">./start.sh</span> again</li>
                  <li>Click &quot;Seed database&quot; below (or run <span className="font-mono">python seed/seed_data.py</span>)</li>
                  <li>
                    <a href="/login" className="underline font-semibold" style={{ color: SIEMENS_PETROL }}>
                      Sign in
                    </a>{" "}
                    with {demoUser}
                  </li>
                </ol>
                {authSecret && (
                  <p className="text-[10px] text-slate-400 font-mono break-all">
                    AUTH_SECRET (saved to .env.local): {authSecret}
                  </p>
                )}
                <button
                  type="button"
                  onClick={onSeed}
                  disabled={seeding}
                  className="text-sm font-semibold text-white rounded-lg px-4 py-2 disabled:opacity-60"
                  style={{ background: SIEMENS_PETROL }}
                >
                  {seeding ? "Seeding…" : "Seed database"}
                </button>
                {seedOutput && (
                  <pre className="text-[10px] font-mono bg-slate-900 text-slate-200 rounded-lg p-3 max-h-48 overflow-auto whitespace-pre-wrap">
                    {seedOutput}
                  </pre>
                )}
                {error && <p className="text-xs text-red-600">{error}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultRow({ ok, label, message }: { ok: boolean; label: string; message: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className={ok ? "text-green-600" : "text-red-600"}>{ok ? "✓" : "✗"}</span>
      <div>
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="text-slate-500"> — {message}</span>
      </div>
    </div>
  );
}
