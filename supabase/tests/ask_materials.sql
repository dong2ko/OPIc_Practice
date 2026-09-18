begin;
select plan(20);

insert into auth.users (id, aud, role, email)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rag-owner@example.test'),
  ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rag-other@example.test');
insert into private.app_config(singleton, owner_user_id) values (true, '10000000-0000-0000-0000-000000000001');

set local role anon;
select throws_ok($$select * from public.search_study_materials('beach')$$, '42501', null, 'anonymous search is denied');
select throws_ok('select public.consume_rag_request()', '42501', null, 'anonymous quota calls are denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
insert into public.questions(id, title, prompt, prompt_translation)
values ('30000000-0000-0000-0000-000000000003', 'Coast', 'Describe your beach trip.', '여행을 설명하세요.');
insert into public.answers(question_id, label, english_text)
values ('30000000-0000-0000-0000-000000000003', 'Sample', 'I visited the beach.');
insert into public.guide_articles(title, section, body) values ('Advice', 'Travel', 'Describe the beach weather.');

select is((select count(*)::integer from public.search_study_materials('beach')), 3, 'retrieves questions, answers and guides');
select is((select count(*)::integer from public.search_study_materials('여행')), 1, 'matches Korean keywords');
select is((select count(*)::integer from public.search_study_materials('BEACH')), 3, 'search is case insensitive');
select is((select count(*)::integer from public.search_study_materials('nonexistent')), 0, 'does not invent matches');
select is((select count(*)::integer from public.search_study_materials('the and')), 0, 'ignores stop words');

update public.answers set archived_at = now();
select is((select count(*)::integer from public.search_study_materials('beach')), 2, 'excludes archived answers');
update public.answers set archived_at = null;
update public.questions set archived_at = now();
select is((select count(*)::integer from public.search_study_materials('beach')), 1, 'excludes archived questions and their active answers');
update public.guide_articles set archived_at = now();
select is((select count(*)::integer from public.search_study_materials('beach')), 0, 'excludes archived guides');
insert into public.guide_articles(title, body) values ('Long beach guide', repeat('beach ', 2000));
select is((select count(*)::integer from public.search_study_materials('beach')), 6, 'returns at most six passages');
select ok((select bool_and(char_length(content) <= 1800) from public.search_study_materials('beach')), 'passages have bounded length');
select ok(public.consume_rag_request(), 'first request is allowed');
select is(public.consume_rag_request(), false, 'immediate repeat is blocked');
select throws_ok('select * from private.rag_usage', '42501', null, 'owner cannot bypass quota through the usage table');
reset role;

update private.rag_usage set requests = 19, last_request_at = clock_timestamp() - interval '11 seconds';
set local role authenticated;
select ok(public.consume_rag_request(), 'twentieth request is allowed');
reset role;
update private.rag_usage set last_request_at = clock_timestamp() - interval '11 seconds';
set local role authenticated;
select is(public.consume_rag_request(), false, 'twenty-first request is blocked');
reset role;
update private.rag_usage set usage_day = (clock_timestamp() at time zone 'UTC')::date - 1;
set local role authenticated;
select ok(public.consume_rag_request(), 'daily quota resets on the next UTC day');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.search_study_materials('beach')), 0, 'unapproved users cannot retrieve owner materials');
select throws_ok('select public.consume_rag_request()', '42501', null, 'unapproved users cannot consume quota');
reset role;

select * from finish();
rollback;
