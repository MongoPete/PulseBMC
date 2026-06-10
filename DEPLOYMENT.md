# Customer deployment — Vercel + Railway

Host the **Next.js frontend** on Vercel and the **FastAPI backend** on Railway. API keys and Atlas credentials live only on Railway; the browser never sees them.

**Local redeploy:** use the setup wizard at `http://localhost:3000/setup` (enabled when `ALLOW_SETUP=true`). The wizard is disabled on Vercel and Railway — use each platform's env var dashboard instead.

## Architecture

| URL | Service | Purpose |
|-----|---------|---------|
| `https://demo.yourdomain.com` | Vercel | Next.js UI + auth + API proxy |
| `https://api.yourdomain.com` | Railway | FastAPI, MongoDB, LLM, simulator |

## 1. Railway (backend)

1. Create a project at [railway.app](https://railway.app) and connect this repo.
2. Set **Root Directory** to `backend`.
3. Railway detects [`backend/Dockerfile`](backend/Dockerfile) and [`backend/railway.toml`](backend/railway.toml).
4. Add environment variables (copy from [`backend/.env.example`](backend/.env.example)):

   | Variable | Notes |
   |----------|-------|
   | `ATLAS_URI` | MongoDB Atlas connection string (demo-scoped user) |
   | `OPENAI_API_KEY` | Or use `GROVE_*` vars instead |
   | `VOYAGE_API_KEY` | Embeddings for vector search |
   | `ALLOWED_ORIGINS` | `https://demo.yourdomain.com,http://localhost:3000` |
   | `BACKEND_API_KEY` | Long random string — same value on Vercel |
   | `SIM_SESSION_MODE` | `true` — simulator only runs during explicit browser sessions |
   | `SIM_LEASE_TIMEOUT_SEC` | `90` — auto-stop if heartbeats missed (optional) |

5. Deploy and confirm `GET https://<railway-url>/health` returns `{"status":"ok"}`.
6. **Custom domain:** Railway → Settings → Networking → add `api.yourdomain.com` → create CNAME at your DNS provider per Railway instructions.

### Seed production data (once)

From your machine with `backend/.env` pointing at the production Atlas cluster:

```bash
cd backend && source .venv/bin/activate && python seed/seed_data.py
```

## 2. Vercel (frontend)

1. Import the repo at [vercel.com](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. Add environment variables (copy from [`frontend/.env.example`](frontend/.env.example)):

   | Variable | Notes |
   |----------|-------|
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `DEMO_USER` | Primary demo login email (e.g. internal tester) |
   | `DEMO_USER_PASSWORD` | Password for `DEMO_USER` |
   | `CUSTOMER_USER` | Customer POC login email (optional second account) |
   | `CUSTOMER_USER_PASSWORD` | Password for `CUSTOMER_USER` |
   | `API_URL` | `https://api.yourdomain.com` |
   | `BACKEND_API_KEY` | Must match Railway |
   | `NEXT_PUBLIC_SIM_SESSION_MODE` | `true` — shows Start live demo; hides manual simulator controls (optional if Railway sets `SIM_SESSION_MODE` — UI auto-detects via `/api/demo/state`) |
   | `NEXT_PUBLIC_SIM_IDLE_TIMEOUT_SEC` | `180` — stop after 3 min idle (optional) |

4. Deploy. The app proxies all REST and SSE traffic through `/api/proxy/*` with the backend API key attached server-side.
5. **Custom domain:** Vercel → Domains → add `demo.yourdomain.com` → add DNS CNAME per Vercel instructions.

## 3. DNS summary

| Record | Type | Target |
|--------|------|--------|
| `demo` | CNAME | Vercel (shown in project Domains) |
| `api` | CNAME | Railway (shown in service Networking) |

Wait for TLS on both hosts before sharing the customer link.

## 4. Security checklist

- [ ] Rotate Atlas user `demoPete` if it was ever pasted into local `assets/` files
- [ ] `.cursor/` and `assets/` are gitignored — not deployed by Vercel
- [ ] No `ATLAS_URI`, `OPENAI_API_KEY`, or `VOYAGE_API_KEY` on Vercel
- [ ] `BACKEND_API_KEY` set on both Railway and Vercel (server-only)
- [ ] Unauthenticated users redirected to `/login`; `/api/proxy/*` returns 401
- [ ] Smoke test: fleet grid, SSE live feed, Explore query, agent chain on alerts
- [ ] Session mode: simulator stopped by default; Start live demo runs only on Fleet/Alerts; stops on tab hide, idle, or leaving Explore

### Simulator session mode (customer kiosk)

With `SIM_SESSION_MODE=true` (Railway) and `NEXT_PUBLIC_SIM_SESSION_MODE=true` (Vercel):

- Simulator **does not run** until the customer clicks **Start live demo** on Fleet.
- Session stays active on **Fleet (`/`) and Alerts (`/alerts`)** only.
- Stops automatically when: browser tab hidden, tab closed, 3 min idle, or navigating to Explore/Architecture.
- Server auto-stops if heartbeats stop for ~90s (Railway lease sweeper).
- Manual scenario injection buttons are hidden in session mode.

## 5. Local development

```bash
# ./setup.sh creates empty env files with ALLOW_SETUP=true
./start.sh
# → http://localhost:3000/setup to paste keys, then restart and seed
```

Manual env editing still works — see `backend/.env.example` and `frontend/.env.example`.
Login with `DEMO_USER` / `DEMO_USER_PASSWORD` (and optionally `CUSTOMER_USER` / `CUSTOMER_USER_PASSWORD`) after setup completes.

## 6. Customer handoff

Share:

- URL: `https://demo.yourdomain.com`
- Customer login: values from `CUSTOMER_USER` / `CUSTOMER_USER_PASSWORD` on Vercel (or `DEMO_USER` if only one account is configured)

**Production (pulse-bmc.vercel.app) — set on Vercel → Settings → Environment Variables:**

| Variable | Value |
|----------|-------|
| `CUSTOMER_USER` | `Ajin@test.com` |
| `CUSTOMER_USER_PASSWORD` | *(customer password — set in dashboard only, not in git)* |

Redeploy after saving env vars. Internal e2e can keep using `DEMO_USER` / `DEMO_USER_PASSWORD`.

Do **not** share repo access, `.env` files, or internal `assets/` / `.cursor/` content.
