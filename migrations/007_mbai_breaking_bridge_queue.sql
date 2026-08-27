create or replace function public.queue_mbai_breaking_bridge_post(
  p_observed_at timestamptz,
  p_signal_id text,
  p_direction text,
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
set search_path = public
as $$
declare
  v_existing record;
  v_recent record;
  v_id bigint;
  v_failed_id bigint;
begin
  if p_target_channel <> '@MBAI_ch' then
    raise exception 'invalid_mbai_breaking_bridge_target' using errcode = '22023';
  end if;
  if p_signal_id is null or p_signal_id = '' or p_direction is null or p_direction = '' then
    raise exception 'invalid_mbai_breaking_bridge_signal' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'mbai_breaking_bridge:' || p_signal_id || ':' || p_direction,
    0
  ));

  select id, status
    into v_existing
    from public.channel_posts
   where dedupe_key = p_dedupe_key
   limit 1
   for update;

  if found then
    if v_existing.status <> 'failed' then
      return jsonb_build_object('queued', false, 'reason', 'skipped_duplicate', 'id', v_existing.id);
    end if;
    v_failed_id := v_existing.id;
  end if;

  select id, status
    into v_recent
    from public.channel_posts
   where lane = 'mbai_breaking_bridge'
     and tags @> array[p_signal_id, p_direction]::text[]
     and status in ('pending', 'sending', 'posted')
     and greatest(created_at, updated_at) >= p_observed_at - interval '2 hours'
   order by greatest(created_at, updated_at) desc
   limit 1
   for update;

  if found then
    return jsonb_build_object('queued', false, 'reason', 'skipped_duplicate', 'id', v_recent.id);
  end if;

  if v_failed_id is not null then
    update public.channel_posts
       set status = 'pending',
           updated_at = now(),
           lane = 'mbai_breaking_bridge',
           source_name = p_source_name,
           headline = p_headline,
           headline_ko = p_headline,
           article_url = p_article_url,
           tags = p_tags,
           post_text = p_post_text,
           target_channel = '@MBAI_ch',
           target_admin = p_target_admin,
           approved_by = p_approved_by,
           reason = p_reason
     where id = v_failed_id
       and status = 'failed'
     returning id into v_id;
    if v_id is not null then
      return jsonb_build_object('queued', true, 'reason', 'queued_worker', 'id', v_id);
    end if;
    return jsonb_build_object('queued', false, 'reason', 'skipped_duplicate', 'id', v_failed_id);
  end if;

  insert into public.channel_posts (
    status, lane, article_id, source_name, headline, headline_ko,
    article_url, tags, post_text, target_channel, target_admin,
    dedupe_key, approved_by, reason
  ) values (
    'pending', 'mbai_breaking_bridge', null, p_source_name, p_headline, p_headline,
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

revoke all on function public.queue_mbai_breaking_bridge_post(
  timestamptz, text, text, text, text, text, text, text[], text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.queue_mbai_breaking_bridge_post(
  timestamptz, text, text, text, text, text, text, text[], text, text, text, text, text
) to service_role;
