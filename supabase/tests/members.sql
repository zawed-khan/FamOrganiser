-- Run after stub, 0001, 0002, access.sql, 0004, login.sql, 0005 and 0006. The Ansari family exists (owner = admin, wife, son).
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
create function pg_temp.as_user(n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'), false);
  execute 'set role authenticated';
end $$;
select set_config('app.fid', (select id::text from public.families where name = 'Ansari'), false);

-- who may add people
select pg_temp.as_user(2);  -- wife: edit access on Expenses, but not the admin
select pg_temp.denied('a non-admin cannot add a person',
  format($q$select public.add_family_member(%L, 'stranger', 'adult')$q$, current_setting('app.fid')));
select pg_temp.denied('no one can add themselves to a family they do not run',
  format($q$select public.add_family_member(%L, 'wife', 'adult')$q$, current_setting('app.fid')));
reset role;

select pg_temp.as_user(1);  -- owner = admin
select pg_temp.denied('cannot add an unknown login name',
  format($q$select public.add_family_member(%L, 'nobody.at.all', 'adult')$q$, current_setting('app.fid')));
select pg_temp.denied('cannot give the admin role',
  format($q$select public.add_family_member(%L, 'stranger', 'admin')$q$, current_setting('app.fid')));
select pg_temp.denied('cannot add someone already in the family',
  format($q$select public.add_family_member(%L, 'wife', 'adult')$q$, current_setting('app.fid')));
select pg_temp.check('admin adds a person by login name (any capitals/spaces)',
  (select public.add_family_member(current_setting('app.fid')::uuid, '  STRANGER ', 'adult', 'Friend')) = 'stranger');
select pg_temp.check('they are now a member with the role and relation',
  exists (select 1 from public.members where family_id = current_setting('app.fid')::uuid
          and user_id = '00000000-0000-0000-0000-000000000004' and role = 'adult' and relation = 'Friend'));
select pg_temp.check('admin can see the new member profile', exists (select 1 from public.profiles where username = 'stranger'));
reset role;

-- a new member starts with no access, until the admin grants a level
select pg_temp.as_user(4);
select pg_temp.check('new member sees no expenses yet', (select count(*) from public.expenses) = 0);
reset role;
select pg_temp.as_user(1);
insert into public.tab_permissions values (current_setting('app.fid')::uuid, '00000000-0000-0000-0000-000000000004', 'expenses', 'view');
reset role;
select pg_temp.as_user(4);
select pg_temp.check('after "view" they see the shared expenses (not private ones)', (select count(*) from public.expenses) = 2);
select pg_temp.denied('view level cannot add an expense',
  format($q$insert into public.expenses (family_id,user_id,amount,currency) values (%L,auth.uid(),1,'SAR')$q$, current_setting('app.fid')));
reset role;

-- someone who made an empty family of their own by mistake is moved over
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000021', 'oops@example.com', '{"name":"Oops Person"}');
select pg_temp.as_user(21);
select public.create_family('Oops Family');
reset role;
select pg_temp.check('the mistaken family exists first', (select count(*) from public.families where name = 'Oops Family') = 1);
select pg_temp.as_user(1);
select public.add_family_member(current_setting('app.fid')::uuid, 'oops.person', 'teen');
reset role;
select pg_temp.check('the empty family of their own is removed', (select count(*) from public.families where name = 'Oops Family') = 0);
select pg_temp.check('they are in exactly the admin family', (select count(*) from public.members where user_id = '00000000-0000-0000-0000-000000000021') = 1
  and exists (select 1 from public.members where user_id = '00000000-0000-0000-0000-000000000021' and family_id = current_setting('app.fid')::uuid));

-- but a family that already has expenses is never deleted
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000022', 'busy@example.com', '{"name":"Busy Person"}');
select pg_temp.as_user(22);
select set_config('app.busy', public.create_family('Busy Family')::text, false);
reset role;
insert into public.expenses (family_id, user_id, amount, currency) values (current_setting('app.busy')::uuid, '00000000-0000-0000-0000-000000000022', 5, 'SAR');
select pg_temp.as_user(1);
select pg_temp.denied('a person with a family that has expenses is not taken over',
  format($q$select public.add_family_member(%L, 'busy.person', 'adult')$q$, current_setting('app.fid')));
reset role;
select pg_temp.check('that family is still there', (select count(*) from public.families where name = 'Busy Family') = 1);

-- admin can remove a member; their access goes with them
select pg_temp.as_user(1);
delete from public.members where user_id = '00000000-0000-0000-0000-000000000004' and family_id = current_setting('app.fid')::uuid;
reset role;
select pg_temp.check('removing a member also removes their access', (select count(*) from public.tab_permissions where user_id = '00000000-0000-0000-0000-000000000004') = 0);
select pg_temp.as_user(4);
select pg_temp.check('a removed person sees nothing again', (select count(*) from public.expenses) = 0);
reset role;
-- ------------------------------------------------ 0006: members can see each other's names (and nothing more)
select pg_temp.as_user(2);  -- wife (plain member): she can only see her own members row...
select pg_temp.check('a member cannot read other people''s members rows (the reason names were blank)',
  (select count(*) from public.members) = 1);
select pg_temp.check('...but family_names() gives her the names of everyone in her family',
  (select count(*) from public.family_names() where username in ('owner.new', 'wife', 'son')) = 3);
select pg_temp.check('...including the admin who added the shared expenses',
  (select display_name from public.family_names() where username = 'owner.new') = 'owner');
select pg_temp.check('family_names() has no email column', not exists (
  select 1 from information_schema.routines r join information_schema.parameters p on p.specific_name = r.specific_name
  where r.routine_name = 'family_names' and p.parameter_name = 'email'));
reset role;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000031', 'loner@example.com', '{"name":"Loner One"}');
select pg_temp.as_user(31);  -- someone in no family
select pg_temp.check('a person in no family sees only themselves', (select count(*) from public.family_names()) = 1);
reset role;
select pg_temp.as_user(4);  -- stranger was removed from the family earlier in this file
select pg_temp.check('a removed person no longer sees the family names', (select count(*) from public.family_names()) = 1);
reset role;
\echo ALL MEMBER CHECKS PASSED
