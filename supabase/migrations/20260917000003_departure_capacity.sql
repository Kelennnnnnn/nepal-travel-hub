-- ============================================================================
-- Into Nepal — Phase 6: Departures and capacity management
--
-- Forensic finding: migration 5 (Inventory) built hold_inventory()/
-- confirm_reservation()/release_reservation() — the three RESERVATION-time
-- mutations — and deliberately gave agency staff NO direct write grant on
-- `inventory` at all ("every mutation goes through the SECURITY DEFINER
-- functions above... never directly via supabase.from('inventory').update()
-- from the browser" — migration 5's own comment on inventory_public_select).
-- That covers reservations. It does NOT cover the one write an agency
-- legitimately needs to make outside any reservation flow: setting a new
-- departure's INITIAL capacity_total (or adjusting it before anyone has
-- booked). No such path existed anywhere — an agency could create a
-- departure (departures_staff_manage already grants direct INSERT) but had
-- no way to ever give it bookable capacity. set_departure_capacity() is
-- that missing write path, following the same SECURITY DEFINER pattern as
-- its siblings rather than opening a raw client UPDATE grant on inventory
-- (which would break the "exactly one write path per concern" invariant
-- migration 5 was built around).
-- ============================================================================

create or replace function public.set_departure_capacity(p_departure_id uuid, p_capacity_total integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
  v_reserved integer;
begin
  select agency_id into v_agency_id from public.departures where id = p_departure_id;
  if v_agency_id is null then
    raise exception 'DEPARTURE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_agency_access(v_agency_id, 'manager') then
    raise exception 'INSUFFICIENT_PRIVILEGE: not a manager of this departure''s agency' using errcode = '42501';
  end if;

  if p_capacity_total < 0 then
    raise exception 'INVALID_CAPACITY: capacity_total cannot be negative' using errcode = 'P0001';
  end if;

  select coalesce(capacity_held, 0) + coalesce(capacity_confirmed, 0) into v_reserved
  from public.inventory where departure_id = p_departure_id;

  if v_reserved is not null and p_capacity_total < v_reserved then
    -- Friendlier than letting the table's own CHECK constraint
    -- (capacity_held + capacity_confirmed <= capacity_total) raise a raw
    -- constraint-violation error — same underlying invariant, clearer cause.
    raise exception 'CAPACITY_BELOW_RESERVED: % spots are already held or confirmed, cannot set capacity below that', v_reserved
      using errcode = 'P0001';
  end if;

  insert into public.inventory (departure_id, capacity_total)
  values (p_departure_id, p_capacity_total)
  on conflict (departure_id) do update
    set capacity_total = excluded.capacity_total, version = public.inventory.version + 1;
end;
$$;

comment on function public.set_departure_capacity(uuid, integer) is
  'The only way to set or change a departure''s bookable capacity outside the reservation flow (hold_inventory/confirm_reservation/release_reservation, migration 5). Lazily creates the inventory row on first call. Refuses to reduce capacity below what is already held+confirmed.';
