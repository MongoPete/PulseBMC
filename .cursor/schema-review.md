# Schema Review — Personal Finance Transaction Tracker

## Context

- **Use case:** Single-user personal finance tracking with demo emphasis on aggregations, Atlas Search, and Change Streams.
- **Collections in scope:** `users`, `accounts`, `categories`, `transactions`
- **Database:** `finance_demo` (configurable via `MONGODB_DB_NAME`)
- **Access patterns:** Recent transactions by date; filter by account/category; monthly spend rollups; full-text search on merchant/description/tags; change stream on inserts.

## Proposed Schema

### Collection: `users`

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | Primary key |
| `displayName` | string | Demo user name |
| `email` | string | Demo email |

**Cardinality:** 1 document (demo user). `DEMO_USER_ID` env references this `_id` after seed.

### Collection: `accounts`

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | Primary key |
| `userId` | ObjectId | Owner |
| `name` | string | e.g. "Chase Checking" |
| `type` | string | `checking` \| `savings` \| `credit` |
| `currency` | string | Default `USD` |
| `currentBalance` | number | **Computed** — updated on transaction insert |

**Cardinality:** 3–5 per user.

### Collection: `categories`

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | Primary key |
| `name` | string | e.g. "Groceries" |
| `group` | string | `needs` \| `wants` \| `income` \| `transfer` |
| `icon` | string | Emoji for UI |

**Cardinality:** ~18 global reference docs.

### Collection: `transactions`

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | Primary key |
| `userId` | ObjectId | Owner |
| `accountId` | ObjectId | FK → accounts |
| `categoryId` | ObjectId | FK → categories |
| `postedAt` | Date | Transaction date |
| `amount` | number | Negative = expense, positive = income |
| `type` | string | `expense` \| `income` |
| `merchant` | string | Searchable |
| `description` | string | Searchable |
| `tags` | string[] | Max 10 — bounded |
| `metadata` | object | Optional `source`, `notes` |

**Cardinality:** 10k–25k per seed run (default 15k).

## MongoDB Pattern Mapping

| Pattern | Application |
|---------|-------------|
| **Extended Reference** | `accountId`, `categoryId` on transactions; `$lookup` in aggregations for labels |
| **Computed** | `accounts.currentBalance` maintained on insert via API |
| **Attribute** | `metadata` subdocument for flexible import/notes without schema migration |

## Anti-Pattern Check

| Risk | Status |
|------|--------|
| Unbounded arrays | **Clear** — `tags` capped at 10 in generator |
| Excessive normalization | **Intentional** — transactions separate from accounts for scale |
| 16 MB documents | **Clear** — no embedding transaction history in accounts |

## Indexes

- `transactions`: `{ userId: 1, postedAt: -1 }`
- `transactions`: `{ userId: 1, categoryId: 1, postedAt: -1 }`
- `transactions`: `{ userId: 1, accountId: 1, postedAt: -1 }`
- `accounts`: `{ userId: 1 }`
- **Atlas Search** (separate): `description`, `merchant`, `tags` on `transactions`

## Hard Gate Approval

- **Approval:** Plan approved — implement as specified (2026-05-16)
- **Logged in `docs/gates.md`:** Yes
