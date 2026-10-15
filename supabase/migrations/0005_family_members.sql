-- Family admin adds a person to the family by typing their login name.
-- The person signs up first (name + password). Everyone but the admin then starts with no access to any tab;
-- the admin chooses none / view / edit / full per tab from the Family screen (plain writes on
-- tab_permissions, already limited to the family admin by the rules in 0001).
--
-- Why a function: the admin cannot look up someone else's profile until they share a family, so
-- the lookup and the insert happen here, after checking the caller really is the family admin.

create function public.add_family_member(p_family uuid, p_username text, p_role text, p_relation text default '')
returns text
language plpgsql security definer set search_path = public as $$
declare pid uuid; pname text; stray uuid;
begin
  if not public.is_family_admin(p_family) then
    raise exception 'Only the family admin can add people.';
  end if;
  if p_role not in ('adult', 'teen', 'child', 'guest') then
    raise exception 'Choose adult, teen, child or guest.';
  end if;

  select id, display_name into pid, pname from public.profiles where username = public.slugify(p_username);
  if pid is null then
    raise exception 'Nobody has signed up with that login name yet. Ask them to sign up first.';
  end if;
  if exists (select 1 from public.members where family_id = p_family and user_id = pid) then
    raise exception '% is already in your family.', pname;
  end if;

  -- Someone who made an empty family of their own by mistake (only them, no expenses) is moved over.
  for stray in
    select f.id from public.families f
    where f.created_by = pid
      and (select count(*) from public.members m where m.family_id = f.id) = 1
      and exists (select 1 from public.members m where m.family_id = f.id and m.user_id = pid)
      and not exists (select 1 from public.expenses e where e.family_id = f.id)
  loop
    delete from public.families where id = stray;
  end loop;

  if exists (select 1 from public.members where user_id = pid) then
    raise exception '% already belongs to another family.', pname;
  end if;

  insert into public.members (family_id, user_id, role, relation)
  values (p_family, pid, p_role, left(trim(coalesce(p_relation, '')), 30));
  return pname;
end
$$;
revoke execute on function public.add_family_member(uuid, text, text, text) from public, anon;
grant execute on function public.add_family_member(uuid, text, text, text) to authenticated;
