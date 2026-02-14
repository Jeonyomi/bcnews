-- 002_issue_first_schema.sql
-- Issue-first schema for dashboard product

create extension if not exists pgcrypto;

create table if not exists public.sources (
  id bigserial primary key,
  name text not null,
  type text not null check (type in ('rss', 'web', 'official')),
  tier text,
  url text not null,
  rss_url text,
  region text check (region in ('KR', 'Global')),
  enabled boolean default true,
  last_success_at timestamptz,
  last_error_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.articles (
  id bigserial primary key,
  title text not null,
  source_id bigint references public.sources(id) on delete set null,
  url text not null,
  canonical_url text,
  published_at_utc timestamptz,
  fetched_at_utc timestamptz not null default now(),
  language text,
  region text not null default 'Global' check (region in ('KR', 'Global')),
  content_text text,
  content_hash text,
  summary_short text,
  why_it_matters text,
  confidence_label text,
  importance_score int,
  importance_label text,
  issue_id bigint,
  status text default 'new',
  created_at timestamptz not null default now()
);
create unique index if not exists ux_articles_url on public.articles(canonical_url);
create unique index if not exists ux_articles_hash on public.articles(content_hash);
create index if not exists idx_articles_published on public.articles(published_at_utc desc);
create index if not exists idx_articles_canonical on public.articles(canonical_url);
create index if not exists idx_articles_hash on public.articles(content_hash);
create index if not exists idx_articles_issue on public.articles(issue_id);

create table if not exists public.issues (
  id bigserial primary key,
  title text not null,
  topic_label text not null,
  region text not null check (region in ('KR', 'Global')),
  first_seen_at_utc timestamptz not null default now(),
  last_seen_at_utc timestamptz not null default now(),
  representative_article_id bigint references public.articles(id) on delete set null,
  issue_summary text,
  why_it_matters text,
  tags jsonb not null default '[]'::jsonb,
  key_entities jsonb not null default '[]'::jsonb,
  importance_score int not null default 0,
  importance_label text not null default 'watch'
);
create index if not exists idx_issues_last_seen on public.issues(last_seen_at_utc desc);
create index if not exists idx_issues_importance on public.issues(importance_score desc);
create index if not exists idx_issues_topic on public.issues(topic_label);

create table if not exists public.issue_updates (
  id bigserial primary key,
  issue_id bigint not null references public.issues(id) on delete cascade,
  update_at_utc timestamptz not null default now(),
  update_summary text not null,
  evidence_article_ids jsonb not null default '[]'::jsonb,
  confidence_label text
);
create index if not exists idx_issue_updates_issue on public.issue_updates(issue_id);
create index if not exists idx_issue_updates_ts on public.issue_updates(update_at_utc desc);

create table if not exists public.tags (
  id bigserial primary key,
  name text not null unique,
  type text
);

create table if not exists public.entities (
  id bigserial primary key,
  name text not null unique,
  entity_type text
);

create table if not exists public.ingest_logs (
  id bigserial primary key,
  source_id bigint references public.sources(id) on delete cascade,
  run_at_utc timestamptz not null default now(),
  status text not null,
  error_message text,
  items_fetched int not null default 0,
  items_saved int not null default 0
);

alter table public.articles
  add constraint if not exists fk_articles_issue
  foreign key (issue_id) references public.issues(id) on delete set null;

alter table public.news_briefs
  disable row level security;

create or replace function public.issue_set_updated_at()
returns trigger as $$
begin
  new.last_seen_at_utc = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_issues_updated_at
before update on public.issues
for each row
execute function public.issue_set_updated_at();

grant select, insert, update on public.sources to anon;
grant select, insert, update on public.articles to anon;
grant select, insert, update on public.issues to anon;
grant select, insert, update on public.issue_updates to anon;
grant select, insert, update on public.tags to anon;
grant select, insert, update on public.entities to anon;
grant select, insert, update on public.ingest_logs to anon;
