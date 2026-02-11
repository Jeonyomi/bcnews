# Architecture (toy)

## Components
- Web (apps/web)
  - Reads from API for lists/search
- API (apps/api)
  - Source of truth for offchain data (news, job runs)
  - Hosts onchain indexer loop (toy)
- DB (Postgres)
  - News briefs
  - Raw transfers (append-only)
  - Hourly metrics (materialized table)
  - Index cursors

## Data flow
1) Indexer polls EVM logs (Transfer) per token per chain.
2) Writes `stablecoin_transfers` (idempotent by chainId+txHash+logIndex).
3) Aggregates into `stablecoin_metrics_hourly`.
4) Web reads via API endpoints.

## Reliability rules
- Indexer uses finalized blocks (confirmations) and stores cursor.
- APIs are stable via shared schemas.
