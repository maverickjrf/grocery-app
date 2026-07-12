-- 0001_extensions_and_helpers.sql
-- Generic trigger/utility helper functions that do not depend on any
-- domain table. current_household_id() and shares_household_history()
-- (also "helpers" in spirit) are deferred to 0002 and 0007 respectively,
-- because both are LANGUAGE sql and Postgres resolves the tables they
-- reference at CREATE FUNCTION time, not at call time — they must be
-- created only after profiles / household_memberships exist.
--
-- No `create extension` statements are included: gen_random_uuid() is
-- native to Postgres 13+ (Supabase's baseline), and no other extension
-- usage was present in the pasted function definitions. If the live
-- project has an explicit extension dependency not visible from the
-- functions/policies alone, add it here.

-- touch_updated_at: generic BEFORE UPDATE trigger, sets updated_at = now().
-- Attached per-table in each table's own migration file.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin new.updated_at := now(); return new; end; $function$;

-- generate_invite_code: 10-char code from an unambiguous alphabet
-- (no 0/O/1/I/L), used by rotate_invite_code() for household invites.
create or replace function public.generate_invite_code()
returns text
language plpgsql
set search_path to ''
as $function$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..10 loop
    result := result || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
  end loop;
  return result;
end; $function$;
