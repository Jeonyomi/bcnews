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

## Scripts

### Brief management
```bash
# Push latest brief to Supabase
npm run push:brief

# Log a job run status
npm run log:run "news-brief-kr-main"          # Success (default)
npm run log:run "news-brief-kr-backup" error  # Failed run
```

### Brief format (v0)

Briefs are stored as markdown files in `data/briefs/` with YAML frontmatter:

```markdown
---
region: KR                             # KR or Global
source: main                           # main or backup
startKst: 2026-02-12T10:32:00+09:00   # Window start (KST)
endKst: 2026-02-12T22:32:00+09:00     # Window end (KST)
isBackup: false                        # Is this a backup run?
topics: [                              # Optional topic tags
  "Regulation/Policy",
  "Stablecoin Issuers/Reserves"
]
score: 80                              # Optional ranking score (0-100)
---

# Digital Asset & Stablecoin Brief
...content...
```

### Run logs format (v0)

Job runs are logged to `data/briefs/runs.jsonl` as JSON Lines:

```jsonl
{"jobId":"news-brief-kr-main","startedAt":"2026-02-12T10:32:00+09:00","region":"KR","isBackup":false,"status":"ok"}
{"jobId":"news-brief-kr-backup","startedAt":"2026-02-12T10:32:00+09:00","region":"KR","isBackup":true,"status":"error","error":"API timeout"}
```

## Repository structure
- `app/`: Next.js frontend code
- `components/`: React components
- `data/briefs/`: Brief markdown files + run logs
- `migrations/`: Database migrations
- `prisma/`: Database schema/client
- `scripts/`: Utility scripts
- `types/`: TypeScript types/schemas

## Next
See `docs/ARCHITECTURE.md` and `docs/API.md`.