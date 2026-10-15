-- Run after stub.sql + migrations 0001-0002 + access.sql (so there are existing people) + 0004_login_by_name.sql.
\set ON_ERROR_STOP on
reset role;
create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAILED: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create function pg_temp.denied(label text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then perform pg_temp.check(label, true); return; end;
  raise exception 'FAILED (was allowed): %', label;
end $$;

-- existing people got a login name
select pg_temp.check('everyone already there got a login name',
  (select count(*) from public.profiles where username is not null) = 5);
select pg_temp.check('login names come from their names',
  (select string_agg(username, ',' order by username) from public.profiles) = 'owner,son,stranger,super,wife');

-- new accounts: name + login name from sign-up
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000011', 'zawed.khan@example.com', '{"name":"Zawed Khan","username":"Zawed Khan"}'),
  ('00000000-0000-0000-0000-000000000012', 'zawed.khan2@example.com', '{"name":"Zawed  KHAN","username":"zawed.khan"}'),
  ('00000000-0000-0000-0000-000000000013', 'ab@example.com', '{}');
select pg_temp.check('login name is the name in lower case with dots', (select username from public.profiles where id = '00000000-0000-0000-0000-000000000011') = 'zawed.khan');
select pg_temp.check('display name keeps capitals and spaces', (select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000011') = 'Zawed Khan');
select pg_temp.check('same login name twice gets a number', (select username from public.profiles where id = '00000000-0000-0000-0000-000000000012') = 'zawed.khan2');
select pg_temp.check('too-short name falls back to a safe login name', (select username from public.profiles where id = '00000000-0000-0000-0000-000000000013') like 'user%');

-- before sign-in (anon)
set role anon;
select pg_temp.check('anon finds the email for a name', public.login_email('Zawed Khan') = 'zawed.khan@example.com');
select pg_temp.check('anon: name is matched however it is typed', public.login_email('  ZAWED   khan ') = 'zawed.khan@example.com');
select pg_temp.check('anon: unknown name gives nothing', public.login_email('nobody here') is null);
select pg_temp.check('anon: taken name is not available', public.username_available('zawed.khan') = false);
select pg_temp.check('anon: free name is available', public.username_available('brand new') = true);
select pg_temp.denied('anon cannot read profiles', 'select * from public.profiles');
reset role;

-- changing your own login name
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
set role authenticated;
update public.profiles set username = 'owner.new' where id = auth.uid();
select pg_temp.check('can change own login name', (select username from public.profiles where id = auth.uid()) = 'owner.new');
select pg_temp.denied('cannot take a name that is used', $q$update public.profiles set username = 'son' where id = auth.uid()$q$);
select pg_temp.denied('cannot use a name that is too short', $q$update public.profiles set username = 'x' where id = auth.uid()$q$);
select pg_temp.denied('cannot use spaces or capitals', $q$update public.profiles set username = 'Bad Name' where id = auth.uid()$q$);
with u as (update public.profiles set username = 'stolen.name' where id = '00000000-0000-0000-0000-000000000002' returning 1)
  select pg_temp.check('cannot change someone else''s login name', count(*) = 0) from u;
select pg_temp.denied('still cannot make yourself super-admin', $q$update public.profiles set is_super_admin = true where id = auth.uid()$q$);
reset role;
\echo ALL LOGIN CHECKS PASSED
