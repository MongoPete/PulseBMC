---
description: "Customer audience profile and visual design constraints for PulseBMC. Apply whenever building UI components, writing README content, authoring API responses surfaced in the UI, or designing any output visible to the customer."
alwaysApply: true
---

# Audience & Visual Design Rules — PulseBMC

## Who is the customer?

- **Role:** Hardware solutions architect
- **Database background:** Fluent in SQL / relational databases (PostgreSQL, MySQL, SQL Server). Thinks in tables, rows, foreign keys, JOINs, and GROUP BY.
- **MongoDB experience:** Minimal — treats it as unfamiliar territory.
- **Learning style:** Strongly visual. Retains diagrams, color-coded indicators, and side-by-side comparisons far better than prose or raw JSON.
- **Goal:** Understand MongoDB Atlas's value for aggregating edge hardware telemetry data, without having to learn MongoDB from scratch.

## Non-negotiable UI rules

1. **Every MongoDB concept that appears in the UI must have a SQL label nearby.**
   - Collection → "like a SQL table"
   - Document → "like a SQL row"
   - Embedded array (`components[]`) → "instead of a JOIN to a child table"
   - `$match` → "WHERE"
   - `$group` → "GROUP BY"
   - `$lookup` → "LEFT JOIN"
   - Never show a MongoDB term in the UI without its SQL equivalent within visual proximity (tooltip, badge, or annotation).

2. **Show the data, not just the result.**
   - Every chart/table must offer a "Query behind this view" popover showing the aggregation pipeline + a SQL equivalent comment.
   - Device detail page must include a collapsible `DocumentViewer` panel showing the live raw document with annotated field labels.

3. **Visual status always beats text status.**
   - LED indicators (green/flashing/red) must be large enough to read from across a room.
   - Use color + icon + label — never color alone.
   - Severity and state changes should animate (pulse/flash) to draw the eye.

4. **AI agent output must render as structured cards, not JSON dumps.**
   - `WorkOrderCard`: title, priority badge (P1–P4 with color), repair steps list, required parts, safety notes.
   - `RootCauseCard`: hypothesis headline, confidence meter (visual bar), evidence list, next steps.
   - Raw JSON should be hidden behind an "expand" toggle for technical users.

5. **Architecture concepts get diagrams, not paragraphs.**
   - README must include an ER-style diagram comparing the MongoDB document model to the equivalent SQL schema (at minimum: `test_runs` with embedded `components[]` vs. two normalized SQL tables).
   - The hybrid edge-to-Atlas architecture must be shown as a flow diagram, not described in text only.

## SQL ↔ MongoDB reference table (use in ConceptBar and README)

| MongoDB | SQL equivalent | Notes |
|---------|---------------|-------|
| Database (`pulse_bmc`) | Database / Schema | Same concept |
| Collection | Table | Schema-flexible; documents can vary |
| Document | Row | JSON structure instead of fixed columns |
| Field | Column | Can be nested or an array |
| `_id` | Primary key | Auto-generated ObjectId |
| Embedded array | Child table + JOIN | No JOIN needed — data co-located |
| Index | Index | Same concept; compound indexes same syntax |
| `$match` | `WHERE` | First stage of aggregation pipeline |
| `$group` | `GROUP BY` | Aggregation stage |
| `$sort` | `ORDER BY` | Aggregation stage |
| `$limit` | `LIMIT` / `TOP` | Aggregation stage |
| `$lookup` | `LEFT JOIN` | Cross-collection join |
| Change Stream | Trigger / LISTEN-NOTIFY | Real-time event on insert/update |
| Atlas M0 | Database server (free tier) | Managed, no infra to run |

## ConceptBar component contract

The `ConceptBar` component renders at the top of every dashboard page. It:
- Shows 3–5 concept cards in a horizontal strip (not a wall of text)
- Each card: MongoDB term → SQL equivalent → live count or stat from Atlas
- Example: `Collection: test_runs | 2,847 documents | ≈ SQL table with 12 fields + nested JSON`
- Has a dismiss/hide toggle that persists in localStorage (power users can turn it off)

## README structure requirements

Every section of the README must follow this pattern when introducing a MongoDB concept:

> **What MongoDB is doing here** (and the SQL equivalent)

For example, before showing an aggregation pipeline, show the SQL query that would produce the same result, then show the MongoDB pipeline.
