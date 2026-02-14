-- 003_issue_first_constraints.sql
-- Add operational constraints/indices for issue-first ingestion and ranking

create unique index if not exists ux_sources_name on public.sources(name);

create index if not exists idx_issues_region_topic on public.issues(region, topic_label);
create index if not exists idx_issues_importance_region on public.issues(importance_score desc, region);
create index if not exists idx_articles_importance on public.articles(importance_score desc);

-- Optional vector-like lookup for near-duplicate candidate matching
create extension if not exists pg_trgm;
create index if not exists idx_articles_title_trgm on public.articles using gin (title gin_trgm_ops);

-- Full-text helpers
alter table public.articles
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary_short, '') || ' ' || coalesce(why_it_matters, '')))
  stored;
create index if not exists idx_articles_search_vector on public.articles using gin(search_vector);

alter table public.issues
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(issue_summary, '') || ' ' || coalesce(why_it_matters, '')))
  stored;
create index if not exists idx_issues_search_vector on public.issues using gin(search_vector);
