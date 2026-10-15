-- Family members can see each other's NAMES (so "who spent" shows names, not a blank).
-- The profiles table also holds emails, so people are not given read access to each other's rows.
-- Instead this function returns only id, display name and login name, and only for people who share
-- an active family with the caller (plus the caller).

create function public.family_names() returns table (id uuid, display_name text, username text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.username
  from public.profiles p
  where p.id = auth.uid()
     or exists (
       select 1
       from public.members a
       join public.members b on b.family_id = a.family_id
       join public.families f on f.id = a.family_id and f.status = 'active'
       where a.user_id = auth.uid() and b.user_id = p.id)
$$;
revoke execute on function public.family_names() from public, anon;
grant execute on function public.family_names() to authenticated;
