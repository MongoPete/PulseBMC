# Phase Status — [Project Name]

## Overall Status

- **Current phase:** Phase 0
- **Overall state:** Not started
- **Last updated:** <!-- YYYY-MM-DD -->

## Phase Tracker

| Phase | Scope | Prerequisites met | Implementation status | Test commands | Test result | Gate approval logged |
|-------|-------|-------------------|----------------------|---------------|-------------|---------------------|
| Phase 0 (Kickoff) | Requirements, model, architecture, plans | — | Pending | — | — | — |
| Phase 1 | Scaffold + connectivity | — | Pending | `npm run smoke:connectivity` | — | — |
| Phase 2 | Seed + CRUD | — | Pending | `npm run seed` | — | — |
| Phase 3 | Atlas Search | — | Pending | `npm run smoke:search` | — | — |
| Phase 4 | Vector Search + embeddings | — | Pending | `npm run smoke:vector` | — | — |
| Phase 5 | Agents | — | Pending | `npm run smoke:agents` | — | — |
| Phase 6 | Polish + handoff | — | Pending | Manual dry-run | — | — |

## Delivered Artifacts

<!-- Fill in as phases complete -->
- `backend/` — Express 5 API (routes, MongoDB client, types)
- `frontend/` — React + Vite + Tailwind SPA (Setup, Search, Agents pages)
- `scripts/` — seed, ensure-search-index, ensure-vector-index, smoke tests
- `README.md`, `docs/runbook.md`

## Next Step (Operator)

1. Copy `.env.example` → `.env` and set `MONGODB_URI` and embedding provider key
2. `npm run seed` — loads collections and generates embeddings
3. `npm run ensure-search-index` — wait for READY
4. `npm run ensure-vector-index` — wait for READY
5. `npm run dev`
