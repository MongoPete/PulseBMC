# Aaron Jin Alignment Scorecard

North-star: **"Why MongoDB for this kind of system?"** — detect → explain → act on one platform.

Last verified: Playwright rubric `e2e/aaron-alignment.spec.ts` + `e2e/live-demo.spec.ts` against production.

| # | Theme | Status | Evidence |
|---|--------|--------|----------|
| 1 | Page split (Fleet / Alerts / Device / Explorer / Architecture) | **ALIGNED** | TopNav routes; device drill-down via drawer + `/devices/[id]` |
| 2 | Restrained Siemens ops UI (no AI slop) | **ALIGNED** | `#009999` petrol, slate cards, operational copy |
| 3 | SQL ↔ Mongo labels (ConceptBar, QueryTooltip) | **ALIGNED** | ConceptBar on by default on Fleet, Alerts, Architecture, Explorer, Device; dismiss persists |
| 4 | Show data — Query behind views + DocumentViewer | **ALIGNED** | QueryTooltip on alerts/device charts; `#doc-viewer` DocumentViewer on device detail |
| 5 | Visual status — large LEDs, testing animation, failure pulse | **ALIGNED** | Fleet dots `w-4 h-4`; `amber-blink`; `failure-pulse` on red |
| 6 | Realistic failures — intermittent / sticky / latched copy | **ALIGNED** | Fleet + device legends distinguish transient, sticky (sim), operator ⚑ latch |
| 7 | Control plane — rerun, isolate, analyze, context menu | **ALIGNED** | DeviceGrid context menu; drawer + alerts workflow |
| 8 | Structured AI cards (not JSON dumps) | **ALIGNED** | RootCauseCard + WorkOrderCard incl. alternatives + required_parts |
| 9 | Robust timestamps | **ALIGNED** | LiveFeed + alerts use server `started_at` via `fmtClock` |
| 10 | Vector / RAG visible | **PARTIAL** | Alerts analysis + Architecture; not on fleet/device |
| 11 | Change Stream → SSE labeled in live UI | **ALIGNED** | `ChangeStreamLiveLabel` on LiveFeed, Alerts, Device detail |
| 12 | Session kiosk mode | **ALIGNED** | Backend `session_mode` auto-detected; Start live demo banner; e2e uses session/start |

## Remaining (out of Phase 2 scope)

- Fleet QueryTooltip for `fleet/states` aggregation
- UI surfacing of temporal degradation / clustering windows
- Prediction stage card on alerts chain
- Set `NEXT_PUBLIC_SIM_SESSION_MODE=true` on Vercel for instant banner (optional — backend detect works)

## Run audit

```bash
cd frontend
E2E_BASE_URL=https://pulse-bmc.vercel.app \
E2E_DEMO_USER=... E2E_DEMO_PASSWORD=... \
npm run test:e2e
```
