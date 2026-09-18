-- Search live passages so edited and archived records never leave a stale index.
create or replace function public.search_study_materials(search_query text)
returns table (source_id text, title text, content text, route text)
language sql stable security invoker set search_path = '' as $$
  with terms as (
    select distinct word
    from regexp_split_to_table(lower(left(search_query, 1200)), '[^[:alnum:]가-힣]+') as word
    where char_length(word) >= 2
      and word <> all(array['the','and','for','with','from','this','that','what','how','can','you','my','me','please','about','into'])
    limit 20
  ), materials as (
    select 'question:' || q.id as source_id, q.title,
      concat_ws(E'\n', q.prompt, q.prompt_translation) as body, '#/library'::text as route
    from public.questions q where q.archived_at is null
    union all
    select 'answer:' || a.id, q.title || ' — ' || a.label,
      concat_ws(E'\n', a.english_text, a.korean_explanation), '#/library'
    from public.answers a join public.questions q on q.id = a.question_id
    where a.archived_at is null and q.archived_at is null
    union all
    select 'guide:' || g.id, g.title, concat_ws(E'\n', g.section, g.body), '#/guides'
    from public.guide_articles g where g.archived_at is null
  ), passages as (
    select m.source_id || ':' || part as source_id, m.title, m.route,
      substring(m.body from part for 1800) as content
    from materials m
    cross join lateral generate_series(1, greatest(char_length(m.body), 1), 1500) part
  ), ranked as (
    select p.*, (
      select coalesce(sum(
        case when strpos(lower(p.title), t.word) > 0 then 2 else 0 end +
        case when strpos(lower(p.content), t.word) > 0 then 1 else 0 end
      ), 0) from terms t
    ) as score
    from passages p
  )
  select r.source_id, r.title, r.content, r.route
  from ranked r
  where r.score > 0 and (select private.is_owner())
  order by r.score desc, r.source_id
  limit 6;
$$;
revoke all on function public.search_study_materials(text) from public, anon;
grant execute on function public.search_study_materials(text) to authenticated;

-- Persistent atomic limits across function instances; no prompt text is stored.
create table private.rag_usage (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  usage_day date not null,
  requests integer not null default 0,
  last_request_at timestamptz not null
);
revoke all on private.rag_usage from public, anon, authenticated;

create or replace function public.consume_rag_request()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := auth.uid();
  today date := (clock_timestamp() at time zone 'UTC')::date;
  claimed uuid;
begin
  if owner is null or not private.is_owner() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  insert into private.rag_usage(owner_id, usage_day, requests, last_request_at)
  values (owner, today, 1, clock_timestamp())
  on conflict (owner_id) do update set
    usage_day = excluded.usage_day,
    requests = case when rag_usage.usage_day = today then rag_usage.requests + 1 else 1 end,
    last_request_at = excluded.last_request_at
  where (rag_usage.usage_day <> today or rag_usage.requests < 20)
    and rag_usage.last_request_at <= clock_timestamp() - interval '10 seconds'
  returning owner_id into claimed;
  return claimed is not null;
end;
$$;
revoke all on function public.consume_rag_request() from public, anon;
grant execute on function public.consume_rag_request() to authenticated;
