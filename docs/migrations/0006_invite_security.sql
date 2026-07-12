-- 0006_invite_security.sql
-- Long unambiguous invite codes (generate_invite_code(), 0001), 3-day
-- expiry, rotate/retire, and three-way join feedback
-- (INVITE_EXPIRED / INVITE_INVALID / success) via join_household().
--
-- join_household() inserts into public.household_memberships (created
-- in 0007) — safe forward reference: it's PL/pgSQL, resolved at call
-- time, not at CREATE FUNCTION time.

create table if not exists public.retired_codes (
  code text primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  retired_at timestamptz not null default now()
);

-- RLS enabled with NO policies: retired_codes is readable/writable only
-- through the SECURITY DEFINER functions below, never directly by
-- clients, per docs/schema.md.
alter table public.retired_codes enable row level security;

create or replace function public.rotate_invite_code()
returns households
language plpgsql
security definer
set search_path to ''
as $function$
declare v_h public.households; v_hid uuid;
begin
  select household_id into v_hid from public.profiles where id = auth.uid();
  if v_hid is null then raise exception 'You are not in a household.'; end if;

  insert into public.retired_codes (code, household_id)
  select invite_code, id from public.households
  where id = v_hid and invite_code is not null
  on conflict (code) do nothing;

  update public.households
  set invite_code = public.generate_invite_code(),
      invite_expires_at = now() + interval '3 days', updated_at = now()
  where id = v_hid
  returning * into v_h;
  return v_h;
end; $function$;

create or replace function public.retire_invite_code()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_hid uuid;
begin
  select household_id into v_hid from public.profiles where id = auth.uid();
  if v_hid is null then raise exception 'You are not in a household.'; end if;

  insert into public.retired_codes (code, household_id)
  select invite_code, id from public.households
  where id = v_hid and invite_code is not null
  on conflict (code) do nothing;

  update public.households set invite_code = null, invite_expires_at = null, updated_at = now()
  where id = v_hid;
end; $function$;

create or replace function public.join_household(p_invite_code text)
returns households
language plpgsql
security definer
set search_path to ''
as $function$
declare v_h public.households; v_current uuid; v_code text;
begin
  v_code := upper(trim(p_invite_code));
  select household_id into v_current from public.profiles where id = auth.uid();
  if v_current is not null then
    raise exception 'You are already in a household. Leave it first.';
  end if;

  select * into v_h from public.households where invite_code = v_code;
  if v_h.id is not null then
    if v_h.invite_expires_at is null or v_h.invite_expires_at <= now() then
      raise exception 'INVITE_EXPIRED';
    end if;
    update public.profiles set household_id = v_h.id, role = 'member', updated_at = now()
    where id = auth.uid();
    insert into public.household_memberships (household_id, user_id)
    values (v_h.id, auth.uid()) on conflict do nothing;
    return v_h;
  end if;

  if exists (select 1 from public.retired_codes where code = v_code) then
    raise exception 'INVITE_EXPIRED';
  end if;

  raise exception 'INVITE_INVALID';
end; $function$;
