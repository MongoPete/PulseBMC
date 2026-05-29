# Definition of Done Template

Complete this checklist before customer handoff or demo.

## P0 (Non-Negotiable)

- [x] Success criteria are explicitly documented and mapped to demo flows.
- [x] All hard gates are approved and logged in `docs/gates.md`.
- [x] `docs/build-plan.md` and `docs/test-plan.md` are complete and current.
- [x] `docs/phase-status.md` includes test commands and results for each phase.
- [ ] Connectivity and e2e smoke tests run with single commands and pass (requires operator `MONGODB_URI`).
- [x] No secrets are committed; `.env.example` is present and accurate.
- [x] Data model review includes pattern mapping and anti-pattern checks.

## P1 (Strongly Recommended)

- [x] Architecture includes Atlas service mapping per component.
- [ ] Benchmark evidence includes p50/p95/p99 and 3+ runs when performance is in scope (out of scope for v1).
- [x] README includes setup, run steps, architecture summary, and expected outcomes.
- [x] `docs/runbook.md` includes reset/reseed/troubleshooting instructions.
- [x] Non-MongoDB dependencies are explicitly justified.

## P2 (Optional Enhancements)

- [ ] Animated architecture view is available for less technical audiences.
- [ ] Additional synthetic data scenarios are prepared for Q&A.
- [ ] Backup demo path prepared for partial outage scenarios.

## Sign-Off

- Final reviewer:
- Date:
- Residual risks accepted:
