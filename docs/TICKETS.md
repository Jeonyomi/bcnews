# Tickets (MVP v0)

## BB (integration)
- [ ] Lock API contracts in `packages/shared` (zod schemas)
- [x] Define DB schema tables + migrations approach (Prisma)

## Backend (apps/api)
- [ ] API key auth middleware
- [ ] Endpoints: health, news(list/detail/create), metrics(latest/hourly), indexer status
- [ ] DB tables: news_briefs, stablecoin_transfers, stablecoin_metrics_hourly, index_cursors, job_runs

## Blockchain/Indexer (apps/api or apps/indexer)
- [ ] Ethereum Transfer log ingestion for token registry
- [ ] Idempotent insert (chainId+txHash+logIndex unique)
- [ ] Hourly aggregation job

## Frontend (apps/web)
- [ ] Pages: /app dashboard, /news, /metrics
- [ ] Components: NewsList, MetricsCards, HealthStatus
