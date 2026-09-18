begin;
select plan(11);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner@example.test', crypt('not-a-real-password', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'other@example.test', crypt('not-a-real-password', gen_salt('bf')), now(), now(), now());
insert into private.app_config(singleton, owner_user_id) values (true, '10000000-0000-0000-0000-000000000001');

set local role anon;
select throws_ok('select * from public.questions', '42501', null, 'anonymous users have no table grant');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.questions), 0, 'unapproved authenticated user reads no questions');
select throws_ok($$insert into public.topics(name) values ('Blocked')$$, '42501', null, 'unapproved authenticated user cannot insert');
select is(public.is_current_user_owner(), false, 'unapproved user fails owner check');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select ok(public.is_current_user_owner(), 'approved owner passes owner check');
select lives_ok($$insert into public.topics(name) values ('Synthetic topic')$$, 'owner can create a topic');
select lives_ok($$insert into public.questions(topic_id,title,prompt,question_type) select id,'Synthetic question','Synthetic prompt','Description' from public.topics where name='Synthetic topic'$$, 'owner can create a question');
select is((select count(*)::integer from public.questions), 1, 'owner can read a question');
select lives_ok($$update public.questions set title='Updated synthetic question', version=2$$, 'owner can update a question');
select lives_ok($$delete from public.questions$$, 'owner can delete a question');
reset role;
select is((select public from storage.buckets where id='study-materials'), false, 'study material bucket is private');

select * from finish();
rollback;
