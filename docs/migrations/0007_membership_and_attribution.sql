-- 0007_membership_and_attribution.sql
-- Historical household membership (for past-member profile attribution),
-- leave/switch household, and the recorded_by_name snapshot on
-- observations. Also completes the profiles RLS SELECT policy deferred
-- from 0002, since it depends on shares_household_history() below.

create table if not exists public.household_memberships (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

alter table public.household_memberships enable row level security;

drop policy if exists "read own memberships" on public.household_memberships;
create policy "read own memberships" on public.household_memberships
  for select
  using (user_id = auth.uid());

-- shares_household_history: LANGUAGE sql, requires household_memberships
-- to exist — satisfied above in this same file.
create or replace function public.shares_household_history(p_user uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.household_memberships m
    where m.household_id = public.current_household_id()
      and m.user_id = p_user
  );
$function$;

-- Completes the profiles SELECT policy started in 0002 (deferred here
-- because it depends on shares_household_history, defined above).
drop policy if exists "read own and household profiles" on public.profiles;
create policy "read own and household profiles" on public.profiles
  for select
  using (id = auth.uid() or shares_household_history(profiles.id));

create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.profiles set household_id = null, role = 'member', updated_at = now()
  where id = auth.uid();
end; $function$;

-- set_observation_recorder: fills recorded_by_name from the recording
-- profile. Attached BEFORE INSERT on observations (trigger name/timing
-- per docs/schema.md).
-- FIX (2026-07-12): observed_by was previously trusted from the client-
-- supplied row (NEW.observed_by), and neither this trigger nor the
-- observations INSERT policy verified it matched the caller — any
-- household member could attribute an observation to another member.
-- Now forces observed_by := auth.uid() before deriving recorded_by_name,
-- so the row can only ever be attributed to the actual caller.
create or replace function public.set_observation_recorder()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  new.observed_by := auth.uid();
  select username into new.recorded_by_name
  from public.profiles where id = new.observed_by;
  return new;
end; $function$;

drop trigger if exists observations_set_recorder on public.observations;
create trigger observations_set_recorder
  before insert on public.observations
  for each row execute function public.set_observation_recorder();
