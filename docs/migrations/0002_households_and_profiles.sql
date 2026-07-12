-- 0002_households_and_profiles.sql
-- Core households + profiles tables, the household-creation RPC, and the
-- signup trigger that provisions a profile row.
--
-- NOTE on ordering: `profiles` SELECT RLS policy also needs
-- shares_household_history(), which itself needs household_memberships
-- (created in 0007). That policy is therefore created in 0007, not here.
-- RLS is enabled on both tables in this file; profiles' UPDATE policy
-- (which has no such dependency) is created here.
--
-- NOTE on grants: no GRANT statements were present in the pasted
-- pg_policies/pg_get_functiondef output, so none are fabricated here.
-- Supabase projects typically grant table privileges to `anon`/
-- `authenticated` at table-creation time via the dashboard; verify this
-- against the live project before relying on this file alone for a
-- fresh setup.

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique,
  invite_expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text,
  household_id uuid references public.households(id),
  role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists households_touch on public.households;
create trigger households_touch
  before update on public.households
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- current_household_id: LANGUAGE sql, so `profiles` must already exist
-- (satisfied — it's created above in this same file).
create or replace function public.current_household_id()
returns uuid
language sql
stable security definer
set search_path to ''
as $function$
  select household_id from public.profiles where id = auth.uid();
$function$;

-- handle_new_user: provisions a profiles row on signup.
-- Attached to auth.users via the on_auth_user_created trigger below
-- (trigger name per docs/schema.md).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.profiles (id, username, display_name)
  values (new.id, split_part(new.email, '@', 1), split_part(new.email, '@', 1));
  return new;
end; $function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- create_household: the only way a household row is created. Household
-- membership is derived entirely from auth.uid(), never a client param.
-- References public.household_memberships (created in 0007) — safe
-- forward reference: PL/pgSQL bodies aren't resolved against the
-- catalog until first call, only at runtime after 0007 has run.
-- FIX (2026-07-12): previously left invite_expires_at NULL, which
-- join_household() treats as expired — new households were unjoinable
-- until the owner rotated the code. Also switched to
-- generate_invite_code() (long unambiguous alphabet) instead of the old
-- 6-char md5-hex code, and now sets a 3-day expiry at creation time,
-- matching rotate_invite_code()'s behavior. References
-- public.generate_invite_code() (created in 0001, which runs first).
create or replace function public.create_household(p_name text)
returns public.households
language plpgsql
security definer
set search_path to ''
as $function$
declare v_h public.households; v_current uuid;
begin
  select household_id into v_current from public.profiles where id = auth.uid();
  if v_current is not null then
    raise exception 'You are already in a household. Leave it first.';
  end if;
  insert into public.households (name, invite_code, invite_expires_at, created_by)
  values (trim(p_name), public.generate_invite_code(), now() + interval '3 days', auth.uid())
  returning * into v_h;
  update public.profiles set household_id = v_h.id, role = 'owner', updated_at = now()
  where id = auth.uid();
  insert into public.household_memberships (household_id, user_id)
  values (v_h.id, auth.uid()) on conflict do nothing;
  return v_h;
end; $function$;

alter table public.households enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "read own household" on public.households;
create policy "read own household" on public.households
  for select
  using (id = current_household_id());

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());
