-- CoastStay foundation: extensions, private schema, enums, shared trigger functions.

create extension if not exists btree_gist with schema extensions;
create extension if not exists citext with schema extensions;

-- Private schema for authorization helpers and trigger functions. Not exposed through PostgREST.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'manager', 'housekeeping', 'finance');
create type public.member_status as enum ('active', 'suspended');
create type public.property_status as enum ('active', 'inactive');
create type public.unit_status as enum ('active', 'inactive');
create type public.property_type as enum ('apartment', 'villa', 'cottage', 'house', 'studio', 'room', 'other');

create type public.booking_source as enum ('airbnb', 'booking_com', 'direct', 'whatsapp', 'phone', 'other');
create type public.booking_status as enum (
  'inquiry', 'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'
);

create type public.payment_method as enum ('mpesa', 'bank_transfer', 'cash', 'card', 'platform_payout', 'other');
create type public.payment_type as enum (
  'deposit', 'balance', 'payment', 'refund', 'adjustment_credit', 'adjustment_debit', 'reversal'
);
-- recorded = entered manually by staff (not verified by an integration)
-- verified = confirmed by a trusted integration callback (e.g. M-Pesa)
create type public.payment_status as enum ('pending', 'recorded', 'verified', 'failed');

create type public.expense_status as enum ('recorded', 'void');

create type public.task_type as enum ('turnover_clean', 'deep_clean', 'inspection', 'laundry', 'restock', 'other');
create type public.task_status as enum ('pending', 'in_progress', 'awaiting_inspection', 'completed', 'cancelled');
create type public.priority_level as enum ('low', 'normal', 'high', 'urgent');

create type public.maintenance_status as enum (
  'reported', 'assigned', 'in_progress', 'waiting_for_parts', 'resolved', 'closed'
);

create type public.inventory_movement_type as enum ('receipt', 'consumption', 'adjustment', 'return', 'transfer_in', 'transfer_out');

create type public.block_reason as enum ('maintenance', 'owner_use', 'external_calendar', 'other');

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Stamps the acting user into the column named by the first trigger argument on insert,
-- so clients cannot attribute records to someone else.
create or replace function app.stamp_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is not null then
    new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], uid));
  end if;
  return new;
end;
$$;

-- Generic slug helper: lower-case, ascii-ish, hyphenated.
create or replace function app.slugify(input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'));
$$;
