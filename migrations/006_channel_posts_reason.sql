alter table if exists public.channel_posts
  add column if not exists reason text;

create index if not exists idx_channel_posts_status_reason
  on public.channel_posts(status, reason, created_at desc);
