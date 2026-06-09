import { auth } from "@/auth";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

async function isSetupRequired(): Promise<boolean> {
  if (process.env.VERCEL) return false;
  if (process.env.ALLOW_SETUP !== "true") return false;
  try {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
    if (!res.ok) return true;
    const data = await res.json();
    return data.setup_required === true;
  } catch {
    return true;
  }
}

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  if (process.env.VERCEL) {
    // Production: no setup wizard
  } else if (process.env.ALLOW_SETUP === "true") {
    const setupRequired = await isSetupRequired();
    if (setupRequired) {
      if (
        pathname === "/setup" ||
        pathname.startsWith("/api/setup") ||
        pathname.startsWith("/api/auth")
      ) {
        return NextResponse.next();
      }
      return NextResponse.redirect(new URL("/setup", req.url));
    }
  }

  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  if (pathname.startsWith("/api/setup")) return NextResponse.next();

  if (pathname.startsWith("/api/proxy")) {
    const isSetupProxy =
      process.env.ALLOW_SETUP === "true" &&
      !process.env.VERCEL &&
      pathname.startsWith("/api/proxy/setup");
    if (!isLoggedIn && !isSetupProxy) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname === "/setup") {
    if (process.env.ALLOW_SETUP !== "true" || process.env.VERCEL) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/login") {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    const login = new URL("/login", req.url);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
