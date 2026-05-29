# Test Plan — Personal Finance Transaction Tracker

## Phase 1 — Connectivity

| Criteria | Command | Pass threshold |
|----------|---------|----------------|
| Cluster reachable, auth OK | `npm run smoke:connectivity` | Exit 0, prints database name and ping |

## Phase 2 — Seed and CRUD

| Criteria | Command | Pass threshold |
|----------|---------|----------------|
| Seed completes | `npm run seed` | Exit 0; ~15k transactions, 1 user, 4 accounts, 18 categories |
| Indexes exist | (part of seed) | 3 compound indexes on `transactions` |
| Manual | POST via UI or curl | New transaction in list; account balance changes |

## Phase 3 — Analytics

| Criteria | Command | Pass threshold |
|----------|---------|----------------|
| Aggregations return data | `npm run smoke:analytics` | Exit 0; spend-by-category has ≥1 bucket |

## Phase 4 — Search

| Criteria | Command | Pass threshold |
|----------|---------|----------------|
| Search returns hits | `npm run smoke:search` | Exit 0; query "Starbucks" or seeded merchant returns ≥1 doc |

**Prerequisite:** Atlas Search index `transaction_search` on `transactions` (run `npm run search:index` after seed).

## Phase 5 — E2E Stream

| Criteria | Command | Pass threshold |
|----------|---------|----------------|
| Insert + stream | `npm run smoke:e2e` | Exit 0; insert detected within 10s (or documented skip if no URI) |

## Phase 6 — Demo dry-run

| Criteria | Method | Pass threshold |
|----------|--------|----------------|
| Full demo | Manual 10-min script | All 5 tabs functional; Overview → Dashboard → add tx → Live → Search |

## Smoke Test Environment

- Requires `MONGODB_URI` in `.env` at repo root (loaded by `dotenv`).
- Optional: `DEMO_USER_ID` after first seed (script prints value).
