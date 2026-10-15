-- Sign in with a name instead of an email.
-- Every profile gets a unique "login name" (lowercase letters/digits separated by dots, e.g. zawed.khan).
-- The sign-in screen turns the typed name into the account's email with login_email() and then signs in
-- with that email and the password, so Supabase's own sign-in is untouched.
-- People who sign up with just a name get a placeholder address (name@example.com) that is never used.
-- Anyone who knows an exact login name can learn the email behind it (and nothing else).

create function public.slugify(t text) returns text
language sql immutable as $$
  select trim(both '.' from regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '.', 'g'))
$$;

alter table public.profiles add column username text;

-- existing people: login name from their name (or email) with a number added if two are the same
do $$
declare r record; base text; candidate text; n int;
begin
  for r in select id, display_name, email from public.profiles order by created_at, id loop
    base := public.slugify(r.display_name);
    if length(base) < 3 then base := public.slugify(split_part(coalesce(r.email, ''), '@', 1)); end if;
    if length(base) < 3 then base := 'user' || substr(replace(r.id::text, '-', ''), 1, 6); end if;
    base := left(base, 30);
    candidate := base; n := 1;
    while exists (select 1 from public.profiles where username = candidate) loop
      n := n + 1; candidate := left(base, 27) || n;
    end loop;
    update public.profiles set username = candidate where id = r.id;
  end loop;
end $$;

alter table public.profiles
  alter column username set not null,
  add constraint profiles_username_format check (username ~ '^[a-z0-9]+(\.[a-z0-9]+)*$' and length(username) between 3 and 30);
create unique index profiles_username_idx on public.profiles (username);

-- people may change their own name and login name, nothing else
grant update (username) on public.profiles to authenticated;

-- new accounts: take the name and login name given at sign-up (sent as user metadata)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare shown text; base text; candidate text; n int := 1;
begin
  shown := coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(new.email, ''), '@', 1));
  base := public.slugify(coalesce(new.raw_user_meta_data ->> 'username', ''));
  if length(base) < 3 then base := public.slugify(shown); end if;
  if length(base) < 3 then base := 'user' || substr(replace(new.id::text, '-', ''), 1, 6); end if;
  base := left(base, 30);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1; candidate := left(base, 27) || n;
  end loop;
  insert into public.profiles (id, email, display_name, username)
  values (new.id, new.email, left(shown, 40), candidate);
  return new;
end
$$;

-- used by the sign-in and sign-up screens before anyone is signed in
create function public.login_email(p_username text) returns text
language sql stable security definer set search_path = public as $$
  select email from public.profiles where username = public.slugify(p_username)
$$;
create function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where username = public.slugify(p_username))
$$;
revoke execute on function public.login_email(text), public.username_available(text) from public;
grant execute on function public.login_email(text), public.username_available(text) to anon, authenticated;
