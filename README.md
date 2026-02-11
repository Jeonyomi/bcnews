# Stablecoin Ops Dashboard (toy)

Goal: a lightweight ops dashboard that combines:
- Daily KR+Global stablecoin news briefs (cron output)
- Onchain stablecoin metrics (supply, mint/burn, transfers, basic depeg)
- System health signals (cron delivery, last run status)

## MVP scope (v0)
1. News
   - Persist daily briefs (content + links) in DB
   - Show latest + history in UI
2. Onchain metrics (EVM only)
   - Ingest ERC-20 Transfer logs for selected stablecoins
   - Compute hourly aggregates: mint/burn/transfer volume, counts, uniques
   - (Optional v0.1) Chainlink price feed if available
3. Cron/health
   - Track scheduled job runs (ok/failed + timestamp)

## Team roles
- BB(비비): PM + integration owner
- CTO Agent: architecture/contracts
- Frontend Agent: web UI
- Backend Agent: API/DB/scheduler
- Blockchain Agent: indexing + normalization

## Decisions (locked for MVP)
- Auth: single-user API key (toy)
- Chains (MVP): Ethereum only
- Storage: Postgres

## Repo structure
- apps/web: frontend
- apps/api: backend API (includes light scheduler)
- apps/indexer: optional (split out later)
- packages/shared: shared types/zod schemas
- packages/sdk: typed API client + token registry

## Next
See `docs/ARCHITECTURE.md` and `docs/API.md`.
