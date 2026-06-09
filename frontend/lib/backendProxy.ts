import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const API_KEY = process.env.BACKEND_API_KEY ?? "";

export async function proxyToBackend(
  request: Request,
  pathSegments: string[],
): Promise<Response> {
  const isSetupRoute =
    process.env.ALLOW_SETUP === "true" &&
    !process.env.VERCEL &&
    pathSegments[0] === "setup";

  if (!isSetupRoute) {
    const session = await auth();
    if (!session) {
      return Response.json({ detail: "Unauthorized" }, { status: 401 });
    }
  }

  const backendPath = `/api/${pathSegments.join("/")}`;
  const url = new URL(backendPath, API_URL);
  const incoming = new URL(request.url);
  url.search = incoming.search;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  if (API_KEY) headers.set("Authorization", `Bearer ${API_KEY}`);

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  const res = await fetch(url.toString(), init);

  const outHeaders = new Headers();
  const resContentType = res.headers.get("content-type");
  if (resContentType) outHeaders.set("content-type", resContentType);
  const cacheControl = res.headers.get("cache-control");
  if (cacheControl) outHeaders.set("cache-control", cacheControl);
  outHeaders.set("X-Accel-Buffering", "no");

  return new Response(res.body, {
    status: res.status,
    headers: outHeaders,
  });
}
