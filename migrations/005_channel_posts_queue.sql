create table if not exists public.channel_posts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','posted','skipped')),
  lane text not null default 'breaking',
  article_id bigint,
  source_name text,
  headline text not null,
  headline_ko text,
  article_url text not null,
  tags text[] not null default '{}',
  post_text text not null,
  target_channel text not null default '@Krypto_breaking',
  target_admin text not null default '@master_billybot',
  dedupe_key text not null unique,
  approved_by text,
  posted_at timestamptz,
  telegram_message_id bigint,
  telegram_chat_id text
);

create index if not exists idx_channel_posts_status_created_at
  on public.channel_posts(status, created_at desc);

create index if not exists idx_channel_posts_lane_status
  on public.channel_posts(lane, status);
