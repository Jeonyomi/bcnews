alter table if exists public.ingest_logs
  add column if not exists stage text;

update public.ingest_logs
set stage = coalesce(stage, 'source')
where stage is null;

create index if not exists idx_ingest_logs_stage_run_at
  on public.ingest_logs(stage, run_at_utc desc);
