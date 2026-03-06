-- 007_ingest_state_cursor.sql
-- Persist cursor state for ingest round-robin scheduling.

create table if not exists public.ingest_state (
  state_key text primary key,
  cursor_source_id bigint,
  last_run_at_utc timestamptz,
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.ingest_state to anon;
