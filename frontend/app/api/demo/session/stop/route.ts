import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const API_KEY = process.env.BACKEND_API_KEY ?? "";

/** Accept sendBeacon POST when tab closes — forwards stop to Railway with API key. */
export async function POST(request: NextRequest) {
  let sessionId = "";
  try {
    const text = await request.text();
    if (text) {
      const parsed = JSON.parse(text) as { session_id?: string };
      sessionId = parsed.session_id ?? "";
    }
  } catch {
    return NextResponse.json({ detail: "Invalid body" }, { status: 400 });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

  const body = sessionId ? JSON.stringify({ session_id: sessionId }) : "{}";
  try {
    await fetch(`${API_URL}/api/demo/session/stop`, {
      method: "POST",
      headers,
      body,
    });
  } catch {
    return NextResponse.json({ detail: "Backend unreachable" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
