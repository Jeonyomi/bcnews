create or replace function public.queue_mbai_hot24_post(
  p_observed_at timestamptz,
  p_issue_tag text,
  p_dedupe_key text,
  p_source_name text,
  p_headline text,
  p_article_url text,
  p_tags text[],
  p_post_text text,
  p_target_channel text,
  p_target_admin text,
  p_approved_by text,
  p_reason text
) returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_existing record;
  v_recent record;
  v_id bigint;
begin
  if p_target_channel <> '@MBAI_ch' then
    raise exception 'invalid_mbai_hot24_target' using errcode = '22023';
  end if;
  if p_issue_tag is null or p_issue_tag = '' or p_issue_tag !~ '^((Issue:[0-9]+)|(Pick:(NEWS|ASSET):(KOREA|US|CRYPTO):[A-Za-z0-9._:-]+))$' then
    raise exception 'invalid_mbai_hot24_issue' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('mbai_hot24:' || p_issue_tag, 0));

  select id, status
    into v_existing
    from public.channel_posts
   where dedupe_key = p_dedupe_key
   limit 1
   for update;

  if found then
    return jsonb_build_object('queued', false, 'reason', 'skipped_duplicate', 'id', v_existing.id);
  end if;

  select id, status
    into v_recent
    from public.channel_posts
   where lane = 'mbai_hot24'
     and tags @> array[p_issue_tag]::text[]
     and status in ('pending', 'sending', 'posted', 'failed', 'skipped')
     and greatest(created_at, updated_at) >= p_observed_at - interval '24 hours'
   order by greatest(created_at, updated_at) desc
   limit 1
   for update;

  if found then
    return jsonb_build_object('queued', false, 'reason', 'skipped_duplicate', 'id', v_recent.id);
  end if;

  insert into public.channel_posts (
    status, lane, article_id, source_name, headline, headline_ko,
    article_url, tags, post_text, target_channel, target_admin,
    dedupe_key, approved_by, reason
  ) values (
    'pending', 'mbai_hot24', null, p_source_name, p_headline, p_headline,
    p_article_url, p_tags, p_post_text, '@MBAI_ch', p_target_admin,
    p_dedupe_key, p_approved_by, p_reason
  ) returning id into v_id;

  return jsonb_build_object('queued', true, 'reason', 'queued_worker', 'id', v_id);
exception
  when unique_violation then
    select id into v_id from public.channel_posts where dedupe_key = p_dedupe_key limit 1;
    return jsonb_build_object('queued', false, 'reason', 'skipped_duplicate', 'id', v_id);
end;
$$;

revoke all on function public.queue_mbai_hot24_post(
  timestamptz, text, text, text, text, text, text[], text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.queue_mbai_hot24_post(
  timestamptz, text, text, text, text, text, text[], text, text, text, text, text
) to service_role;
