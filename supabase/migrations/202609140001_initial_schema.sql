create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.app_config (
  singleton boolean primary key default true check (singleton),
  owner_user_id uuid not null unique references auth.users(id) on delete restrict,
  configured_at timestamptz not null default now()
);
revoke all on private.app_config from public, anon, authenticated;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from private.app_config
      where owner_user_id = (select auth.uid())
    );
$$;
revoke all on function private.is_owner() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_owner() to authenticated;

create or replace function public.is_current_user_owner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_owner(); $$;
revoke all on function public.is_current_user_owner() from public, anon;
grant execute on function public.is_current_user_owner() to authenticated;

create type public.progress_status as enum ('not_started', 'practicing', 'confident');

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  sort_order integer not null default 0,
  version integer not null default 1 check (version > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  question_code text,
  title text not null check (char_length(title) between 1 and 300),
  prompt text not null check (char_length(prompt) between 1 and 50000),
  prompt_translation text,
  question_type text not null default 'Unclassified',
  source_filename text,
  source_reference text,
  source_sha256 text,
  source_client_id text,
  is_supplement boolean not null default false,
  version integer not null default 1 check (version > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, source_sha256, source_client_id)
);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  label text not null default 'Model answer',
  english_text text not null check (char_length(english_text) between 1 and 100000),
  korean_explanation text,
  sort_order integer not null default 0,
  version integer not null default 1 check (version > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.guide_articles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  section text,
  body text not null check (char_length(body) between 1 and 200000),
  source_filename text,
  source_reference text,
  source_sha256 text,
  source_client_id text,
  sort_order integer not null default 0,
  version integer not null default 1 check (version > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, source_sha256, source_client_id)
);

create table public.expressions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id uuid references public.questions(id) on delete cascade,
  phrase text not null check (char_length(phrase) between 1 and 1000),
  meaning text,
  usage_note text,
  version integer not null default 1 check (version > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.study_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id uuid references public.questions(id) on delete cascade,
  body text not null check (char_length(body) <= 100000),
  version integer not null default 1 check (version > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, question_id)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default '#247b7b' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  version integer not null default 1 check (version > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.question_tags (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, question_id, tag_id)
);

create table public.favorites (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, question_id)
);

create table public.question_progress (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  status public.progress_status not null default 'not_started',
  practice_count integer not null default 0 check (practice_count >= 0),
  last_practiced_at timestamptz,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, question_id)
);

create table public.source_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  filename text not null check (char_length(filename) between 1 and 300),
  storage_path text not null unique,
  media_type text not null,
  byte_size bigint not null check (byte_size between 0 and 26214400),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, sha256)
);

create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_filename text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  inventory jsonb not null default '{}'::jsonb,
  status text not null default 'completed' check (status in ('completed', 'failed')),
  created_at timestamptz not null default now(),
  unique (owner_id, source_sha256)
);

create table public.import_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  import_run_id uuid not null references public.import_runs(id) on delete cascade,
  client_id text not null,
  target_table text not null check (target_table in ('questions', 'guide_articles')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (owner_id, import_run_id, client_id)
);

create table public.material_chunks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_kind text not null check (source_kind in ('question', 'answer', 'guide', 'note')),
  source_id uuid not null,
  source_section text,
  content text not null,
  content_hash text not null,
  embedding extensions.vector,
  index_status text not null default 'not_configured' check (index_status in ('not_configured', 'pending', 'ready', 'failed', 'superseded')),
  retry_count integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, source_kind, source_id, content_hash)
);

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function private.protect_owner_id()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner() or new.owner_id is distinct from (select auth.uid()) then
    raise exception 'owner_id is protected' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['topics','questions','answers','guide_articles','expressions','study_notes','tags','question_tags','favorites','question_progress','source_documents','import_runs','import_items','material_chunks']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('create policy owner_only_select on public.%I for select to authenticated using ((select private.is_owner()) and owner_id = (select auth.uid()))', table_name);
    execute format('create policy owner_only_insert on public.%I for insert to authenticated with check ((select private.is_owner()) and owner_id = (select auth.uid()))', table_name);
    execute format('create policy owner_only_update on public.%I for update to authenticated using ((select private.is_owner()) and owner_id = (select auth.uid())) with check ((select private.is_owner()) and owner_id = (select auth.uid()))', table_name);
    execute format('create policy owner_only_delete on public.%I for delete to authenticated using ((select private.is_owner()) and owner_id = (select auth.uid()))', table_name);
    execute format('create trigger protect_owner before insert or update on public.%I for each row execute function private.protect_owner_id()', table_name);
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array['topics','questions','answers','guide_articles','expressions','study_notes','tags','question_progress','material_chunks']
  loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()', table_name);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-materials', 'study-materials', false, 26214400, array[
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'application/json',
  'application/octet-stream'
]) on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy study_materials_select on storage.objects for select to authenticated
using (bucket_id = 'study-materials' and (select private.is_owner()) and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy study_materials_insert on storage.objects for insert to authenticated
with check (bucket_id = 'study-materials' and (select private.is_owner()) and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy study_materials_update on storage.objects for update to authenticated
using (bucket_id = 'study-materials' and (select private.is_owner()) and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'study-materials' and (select private.is_owner()) and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy study_materials_delete on storage.objects for delete to authenticated
using (bucket_id = 'study-materials' and (select private.is_owner()) and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function private.import_study_package_impl(package jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid := (select auth.uid());
  run_id uuid;
  question jsonb;
  guide jsonb;
  answer jsonb;
  expression jsonb;
  topic_uuid uuid;
  question_uuid uuid;
  guide_uuid uuid;
  note_body text;
  inserted_questions integer := 0;
  inserted_guides integer := 0;
begin
  if not private.is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if (package->>'schemaVersion')::integer <> 1 then raise exception 'Unsupported import schema'; end if;
  if coalesce(package#>>'{source,sha256}', '') !~ '^[0-9a-f]{64}$' then raise exception 'Invalid source hash'; end if;
  insert into public.import_runs(owner_id, source_filename, source_sha256, inventory)
  values (owner, left(package#>>'{source,filename}', 300), package#>>'{source,sha256}', coalesce(package->'inventory','{}'::jsonb))
  on conflict (owner_id, source_sha256) do nothing returning id into run_id;
  if run_id is null then return jsonb_build_object('status','duplicate','questionsInserted',0,'guidesInserted',0); end if;

  for question in select value from jsonb_array_elements(coalesce(package->'questions','[]'::jsonb)) loop
    insert into public.topics(owner_id, name, description, sort_order)
    values(owner, left(coalesce(nullif(question->>'topic',''),'Uncategorized'),120), null, 0)
    on conflict (owner_id, name) do nothing;
    select id into topic_uuid from public.topics where owner_id = owner and name = left(coalesce(nullif(question->>'topic',''),'Uncategorized'),120);
    insert into public.questions(owner_id, topic_id, question_code, title, prompt, prompt_translation, question_type, source_filename, source_reference, source_sha256, source_client_id, is_supplement)
    values(owner, topic_uuid, nullif(left(question->>'questionCode',100),''), left(coalesce(nullif(question->>'title',''),'Untitled question'),300), left(coalesce(nullif(question->>'prompt',''),'Missing question text'),50000), nullif(left(question->>'promptTranslation',50000),''), left(coalesce(nullif(question->>'questionType',''),'Unclassified'),120), left(package#>>'{source,filename}',300), left(question->>'sourceReference',1000), package#>>'{source,sha256}', left(question->>'clientId',200), coalesce((question->>'isSupplement')::boolean,false))
    on conflict (owner_id, source_sha256, source_client_id) do nothing returning id into question_uuid;
    if question_uuid is null then continue; end if;
    inserted_questions := inserted_questions + 1;
    insert into public.import_items(owner_id, import_run_id, client_id, target_table, target_id) values(owner, run_id, left(question->>'clientId',200), 'questions', question_uuid);
    for answer in select value from jsonb_array_elements(coalesce(question->'answers','[]'::jsonb)) loop
      if nullif(answer->>'englishText','') is not null then
        insert into public.answers(owner_id, question_id, label, english_text, korean_explanation)
        values(owner, question_uuid, left(coalesce(nullif(answer->>'label',''),'Model answer'),120), left(answer->>'englishText',100000), nullif(left(answer->>'koreanExplanation',100000),''));
      end if;
    end loop;
    for expression in select value from jsonb_array_elements(coalesce(question->'expressions','[]'::jsonb)) loop
      if nullif(expression->>'phrase','') is not null then
        insert into public.expressions(owner_id, question_id, phrase, meaning) values(owner, question_uuid, left(expression->>'phrase',1000), nullif(left(expression->>'meaning',5000),''));
      end if;
    end loop;
    select string_agg(value, E'\n\n') into note_body
    from jsonb_array_elements_text(coalesce(question->'notes','[]'::jsonb));
    if nullif(note_body, '') is not null then
      insert into public.study_notes(owner_id, question_id, body)
      values(owner, question_uuid, left(note_body,100000));
    end if;
  end loop;

  for guide in select value from jsonb_array_elements(coalesce(package->'guides','[]'::jsonb)) loop
    insert into public.guide_articles(owner_id, title, section, body, source_filename, source_reference, source_sha256, source_client_id)
    values(owner, left(coalesce(nullif(guide->>'title',''),'Untitled guide'),300), nullif(left(guide->>'section',300),''), left(coalesce(nullif(guide->>'body',''),'Missing guide text'),200000), left(package#>>'{source,filename}',300), left(guide->>'sourceReference',1000), package#>>'{source,sha256}', left(guide->>'clientId',200))
    on conflict (owner_id, source_sha256, source_client_id) do nothing returning id into guide_uuid;
    if guide_uuid is not null then
      inserted_guides := inserted_guides + 1;
      insert into public.import_items(owner_id, import_run_id, client_id, target_table, target_id) values(owner, run_id, left(guide->>'clientId',200), 'guide_articles', guide_uuid);
    end if;
  end loop;
  return jsonb_build_object('status','completed','questionsInserted',inserted_questions,'guidesInserted',inserted_guides);
end;
$$;
revoke all on function private.import_study_package_impl(jsonb) from public;
grant execute on function private.import_study_package_impl(jsonb) to authenticated;

create or replace function public.import_study_package(package jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.import_study_package_impl(package); $$;
revoke all on function public.import_study_package(jsonb) from public, anon;
grant execute on function public.import_study_package(jsonb) to authenticated;

create or replace function private.restore_workspace_backup_impl(backup jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner uuid := (select auth.uid()); item jsonb; inserted_count integer := 0;
begin
  if not private.is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if (backup->>'schemaVersion')::integer <> 1 then raise exception 'Unsupported backup schema'; end if;
  for item in select value from jsonb_array_elements(coalesce(backup#>'{data,topics}','[]'::jsonb)) loop
    insert into public.topics(id,owner_id,name,description,sort_order,version,archived_at,created_at,updated_at)
    values((item->>'id')::uuid,owner,item->>'name',item->>'description',coalesce((item->>'sort_order')::integer,0),coalesce((item->>'version')::integer,1),(item->>'archived_at')::timestamptz,coalesce((item->>'created_at')::timestamptz,now()),coalesce((item->>'updated_at')::timestamptz,now())) on conflict do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(backup#>'{data,questions}','[]'::jsonb)) loop
    insert into public.questions(id,owner_id,topic_id,question_code,title,prompt,prompt_translation,question_type,source_filename,source_reference,is_supplement,version,archived_at,created_at,updated_at)
    values((item->>'id')::uuid,owner,(item->>'topic_id')::uuid,item->>'question_code',item->>'title',item->>'prompt',item->>'prompt_translation',item->>'question_type',item->>'source_filename',item->>'source_reference',coalesce((item->>'is_supplement')::boolean,false),coalesce((item->>'version')::integer,1),(item->>'archived_at')::timestamptz,coalesce((item->>'created_at')::timestamptz,now()),coalesce((item->>'updated_at')::timestamptz,now())) on conflict do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(backup#>'{data,answers}','[]'::jsonb)) loop
    insert into public.answers(id,owner_id,question_id,label,english_text,korean_explanation,sort_order,version,archived_at)
    values((item->>'id')::uuid,owner,(item->>'question_id')::uuid,item->>'label',item->>'english_text',item->>'korean_explanation',coalesce((item->>'sort_order')::integer,0),coalesce((item->>'version')::integer,1),(item->>'archived_at')::timestamptz) on conflict do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(backup#>'{data,guides}','[]'::jsonb)) loop
    insert into public.guide_articles(id,owner_id,title,section,body,source_filename,source_reference,sort_order,version,archived_at,updated_at)
    values((item->>'id')::uuid,owner,item->>'title',item->>'section',item->>'body',item->>'source_filename',item->>'source_reference',coalesce((item->>'sort_order')::integer,0),coalesce((item->>'version')::integer,1),(item->>'archived_at')::timestamptz,coalesce((item->>'updated_at')::timestamptz,now())) on conflict do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(backup#>'{data,expressions}','[]'::jsonb)) loop
    insert into public.expressions(id,owner_id,question_id,phrase,meaning,usage_note,version,archived_at)
    values((item->>'id')::uuid,owner,(item->>'question_id')::uuid,item->>'phrase',item->>'meaning',item->>'usage_note',coalesce((item->>'version')::integer,1),(item->>'archived_at')::timestamptz) on conflict do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(backup#>'{data,notes}','[]'::jsonb)) loop
    insert into public.study_notes(id,owner_id,question_id,body,version,archived_at,updated_at)
    values((item->>'id')::uuid,owner,(item->>'question_id')::uuid,item->>'body',coalesce((item->>'version')::integer,1),(item->>'archived_at')::timestamptz,coalesce((item->>'updated_at')::timestamptz,now())) on conflict do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(backup#>'{data,tags}','[]'::jsonb)) loop
    insert into public.tags(id,owner_id,name,color,version,archived_at)
    values((item->>'id')::uuid,owner,item->>'name',coalesce(item->>'color','#247b7b'),coalesce((item->>'version')::integer,1),(item->>'archived_at')::timestamptz) on conflict do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(backup#>'{data,questionTags}','[]'::jsonb)) loop
    insert into public.question_tags(owner_id,question_id,tag_id)
    values(owner,(item->>'question_id')::uuid,(item->>'tag_id')::uuid) on conflict do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(backup#>'{data,favorites}','[]'::jsonb)) loop
    insert into public.favorites(owner_id,question_id)
    values(owner,(item->>'question_id')::uuid) on conflict do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(backup#>'{data,progress}','[]'::jsonb)) loop
    insert into public.question_progress(owner_id,question_id,status,practice_count,last_practiced_at,version)
    values(owner,(item->>'question_id')::uuid,(item->>'status')::public.progress_status,coalesce((item->>'practice_count')::integer,0),(item->>'last_practiced_at')::timestamptz,coalesce((item->>'version')::integer,1)) on conflict do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(backup#>'{data,documents}','[]'::jsonb)) loop
    insert into public.source_documents(id,owner_id,filename,storage_path,media_type,byte_size,sha256,archived_at,created_at)
    values((item->>'id')::uuid,owner,item->>'filename',item->>'storage_path',item->>'media_type',(item->>'byte_size')::bigint,item->>'sha256',(item->>'archived_at')::timestamptz,coalesce((item->>'created_at')::timestamptz,now())) on conflict do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end loop;
  return jsonb_build_object('status','completed','recordsInserted',inserted_count,'mode','missing_only');
end;
$$;
revoke all on function private.restore_workspace_backup_impl(jsonb) from public;
grant execute on function private.restore_workspace_backup_impl(jsonb) to authenticated;
create or replace function public.restore_workspace_backup(backup jsonb)
returns jsonb language sql security invoker set search_path = '' as $$ select private.restore_workspace_backup_impl(backup); $$;
revoke all on function public.restore_workspace_backup(jsonb) from public, anon;
grant execute on function public.restore_workspace_backup(jsonb) to authenticated;

comment on schema private is 'Not exposed through the Data API. Holds the immutable owner allowlist and privileged implementations.';
comment on table public.material_chunks is 'Optional RAG index. No external provider is called until separately configured.';
