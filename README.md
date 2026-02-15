# bcnews-agent Issue-First Dashboard

A full Next.js dashboard (Vercel + Supabase only) for tracking today’s digital-asset & stablecoin issues.

Current architecture is **issue-first**:
- Articles are ingested and normalized into `articles`
- Similar articles are grouped into `issues`
- Issue activity/timeline is stored in `issue_updates`
- UI pages are optimized for quick scanning (`/dashboard`, `/issues`, `/articles`)

## Pages (Required IA)
- `/dashboard`
  - Top Issues (importance + freshness)
  - Top Updates (issues with new evidence in window)
  - Trends (7d)
- `/issues`
  - List with filters: time window / region / topic / sort / search
  - Toggle card/table view
- `/issues/[id]`
  - Sticky issue summary, why it matters, tags/entities
  - Update timeline from `issue_updates`
  - Related articles list
- `/articles`
  - Table-first listing (title, source chip, summary, importance/confidence, time)
- `/search`
  - Unified search returning Issues first, then Articles
- `/sources`
  - Source health/ingest status/errors/tiers

## Stack & Constraints
- **Frontend:** Next.js (App Router)
- **Compute:** Vercel Serverless Functions (`/api/*`)
- **Data:** Supabase Postgres
- **No external server**
- **No notifications/alerts implementation**

## Setup

### 1) Install
```bash
npm install
```

### 2) Environment
Copy `.env.example` to `.env` and fill values.

Required variables:
- `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `SUPABASE_ANON_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY` (for server writes/ingest)
- `DATABASE_URL` (Postgres DSN for migrations)
- `CRON_SECRET` (or `X_CRON_SECRET`)

### 3) DB migrations

```bash
# old schema migration
npm run migrate:001

# issue-first migrations (schema + constraints)
npm run migrate:issue
```

### 4) Seed sources (initial official/major/media list)

```bash
npm run seed:sources
```

### 5) Run

```bash
npm run dev
```

Open: `http://localhost:3000`

## API Endpoints
- `GET /api/articles`
- `GET /api/issues`
- `GET /api/issues/[id]`
- `GET /api/search`
- `GET /api/trends`
- `GET /api/sources`
- `POST /api/jobs/ingest` (protected by `x-cron-secret`)

## Source-first ingest / ranking behavior

### issue_updates generation
- For every deduped article ingestion:
  - Article is inserted into `articles`
  - Matching/created issue is found or created
  - A row is appended to `issue_updates` with:
    - `update_summary`
    - `evidence_article_ids` (array of article IDs)

These `issue_updates` power:
- Issue timeline in `/issues/[id]`
- Update counts / freshness ordering in `/dashboard` and `/issues`

### ranking / importance labeling
`importance_score` is computed from:
- source tier (official/regulators > major media > industry media > refs)
- topic/event type (regulation/aml/publisher etc.)
- keyword signals and entity extraction

`importance_label` mapping:
- `>=72` → `high`
- `45..71` → `medium`
- `<45` → `low`

## Seeded sources (initial)
Seed list includes 50+ sources (official/regulator + media + research + data refs) and is loaded from:
- `scripts/seedSources.mjs`

## Cron setup (Vercel)
`vercel.json` contains:
```json
{
  "crons": [
    {
      "path": "/api/jobs/ingest",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

Deploy secrets in Vercel:
- `CRON_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` (optional for migration-only workflows)

## Basic test plan

### Functional acceptance
1. **Home route redirect**
   - `/` redirects to `/dashboard`
2. **Dashboard rendering**
   - Loads Top Issues, Top Updates, Trends without errors
3. **Issues list**
   - Supports search, time window, region, topic, sort and view toggle
4. **Issue detail**
   - Timeline visible with at least one update when issue has updates
   - Related articles list visible
5. **Articles page**
   - Filters and search returns expected rows in table
6. **Search page**
   - Query returns issues first then articles
7. **Sources page**
   - Source rows + health row visible from `ingest_logs`

### Ingestion + data quality checks
1. Run ingest endpoint (dev/local test)
```bash
curl -X POST http://localhost:3000/api/jobs/ingest -H "x-cron-secret: <CRON_SECRET>"
```
2. Confirm new rows in:
   - `articles`
   - `issues`
   - `issue_updates`
3. Confirm dedupe behavior: same article (canonical URL/hash) is not duplicated
4. Confirm duplicate/old feeds do not produce repeated rows

### Acceptance criteria
- [ ] No external servers
- [ ] `/dashboard` + `/issues` + `/issues/[id]` + `/articles` + `/search` + `/sources` all work
- [ ] `issue_updates` exists and is used by timeline/top updates
- [ ] summaries + links only are shown in article card/table rows
- [ ] no notification integrations implemented

## Notes
- This project intentionally prioritizes operational clarity over UI embellishment.
- Existing legacy brief feature files are preserved under `app/api/news*` for compatibility when needed.
