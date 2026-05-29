# Build Plan — [Project Name]

## Objectives

- **Customer outcome:** <!-- What MongoDB value does this demo prove? e.g. "Demonstrate Atlas Search + Vector Search breadth in a [domain] scenario." -->
- **Success criteria:** Seeded data, all UI pages functional, smoke tests passing, educational transparency panels visible.

## Phase Plan

| Phase | Goal | Prerequisites | Outputs | Dependencies |
|-------|------|---------------|---------|--------------|
| 0 | Kickoff docs | Plan approved | schema-review, architecture, build-plan, test-plan | — |
| 1 | Scaffold + connectivity | Atlas URI in `.env` | Repo structure, health endpoint, smoke:connectivity | Phase 0 |
| 2 | Seed + CRUD | Phase 1 | Seed script, core collection APIs, Setup page functional | Phase 1 |
| 3 | Atlas Search | Phase 2 + Search index | Lexical/compound search APIs, Search page | Phase 2 |
| 4 | Vector Search | Phase 2 + Vector index + embeddings | Vector/hybrid search APIs, Search page extended | Phase 2 |
| 5 | Agents | Phase 3–4 | Agent API routes, Agents page | Phases 3–4 |
| 6 | Polish + handoff | Phases 3–5 | README, runbook, branding | Phases 3–5 |

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Search index not READY at demo time | `ensure-search-index` script with retry loop; seed before indexing |
| Embedding latency on large seed | Batch embed during setup; store in Atlas, not at query time |
| Vector index dimension mismatch | Pin model + dimensions in `.env.example`; validate on startup |
| <!-- Add project-specific risks --> | <!-- Mitigation --> |

## Hard Gate Approval

- **Approval:** <!-- "Plan approved — implement as specified (YYYY-MM-DD)" or "Pending" -->
- **Logged in `gates.md`:** <!-- Yes / No -->
