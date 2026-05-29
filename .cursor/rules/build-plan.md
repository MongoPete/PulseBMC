# Build Plan — Personal Finance Transaction Tracker

## Objectives

- **Customer outcome:** Demonstrate MongoDB Atlas breadth (aggregations, Search, Change Streams) in a relatable personal finance scenario.
- **Success criteria:** See plan — seed data, 5 UI tabs, smoke tests, educational transparency panels.

## Phase Plan

| Phase | Goal | Prerequisites | Outputs | Dependencies |
|-------|------|---------------|---------|--------------|
| 0 | Kickoff docs | Plan approved | schema-review, architecture, build-plan, test-plan | — |
| 1 | Scaffold + connectivity | Atlas URI in `.env` | Next.js app, health API, smoke:connectivity | Phase 0 |
| 2 | Seed + CRUD | Phase 1 | seed script, transactions/accounts/categories APIs, Transactions tab | Phase 1 |
| 3 | Dashboard | Phase 2 + seeded data | Analytics APIs, Dashboard tab + pipeline panel | Phase 2 |
| 4 | Atlas Search | Phase 2 + index | Search API, Search tab, smoke:search | Phase 2 |
| 5 | Change Streams | Phase 2 | SSE endpoint, Live Activity tab, smoke:e2e | Phase 2 |
| 6 | Polish + handoff | Phases 3–5 | README, runbook, branding | Phases 3–5 |

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| SSE in serverless | `runtime = 'nodejs'`, `dynamic = 'force-dynamic'` on stream route |
| Search index delay | Seed first; `ensure-search-index` script with retry in smoke test |
| Balance drift | v1 insert-only in UI |

## Hard Gate Approval

- **Approval:** Plan approved — implement as specified (2026-05-16)
- **Logged in `docs/gates.md`:** Yes
