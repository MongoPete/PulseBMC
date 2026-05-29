# Runbook — SCoRe Finance Demo

## Reset and reseed

```bash
npm run seed
# Update DEMO_USER_ID in .env from script output
npm run search:index
```

## Troubleshooting

### `MONGODB_URI is not set`

Copy `.env.example` to `.env` at repo root. Next.js loads it via `frontend/next.config.ts`.

### Connectivity fails

- Confirm Atlas Network Access includes your IP
- Verify username/password in connection string
- Test: `npm run smoke:connectivity`

### Dashboard empty

- Run `npm run seed`
- Set `DEMO_USER_ID` in `.env` to the ObjectId printed by seed

### Search returns no results

1. Confirm index `transaction_search` is **ACTIVE** on `transactions` in Atlas UI  
2. Re-run `npm run search:index` if needed  
3. Try query `Starbucks` (seeded merchant)  
4. `npm run smoke:search`

### Live Activity disconnected

- Ensure dev server is running (`npm run dev`)
- Change Streams require replica set (Atlas provides this)
- Check browser console for SSE errors

### E2E stream test fails

- Same as Live Activity — cluster must support Change Streams
- `npm run smoke:e2e` inserts and watches directly via driver

## Pre-demo checklist

- [ ] `npm run smoke:connectivity` passes  
- [ ] Data seeded; dashboard shows charts  
- [ ] Search index READY; `npm run smoke:search` passes  
- [ ] Live tab shows “Connected”  
- [ ] Browser at http://localhost:3100  
