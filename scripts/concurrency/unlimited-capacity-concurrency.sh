#!/usr/bin/env bash
# Prompt 23 acceptance check: a listing with NO daily_booking_limit (the
# Phase 19 default — unlimited) must let every genuinely concurrent caller
# through. This is the mirror image of daily-limit-concurrency.sh: the
# same advisory lock still serializes the 50 callers one at a time, but
# since there is no capacity ceiling to enforce, is_date_bookable() must
# keep saying 'open' for every one of them and all 50 holds must succeed.
#
# Run via: bash scripts/concurrency/unlimited-capacity-concurrency.sh
# (local stack must already be running: `supabase start`)
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
RUN_ID="$(date +%s)${RANDOM}${RANDOM}"
AGENCY_ID="e2a00000-0000-0000-0000-00000000${RUN_ID: -4}"
LISTING_ID="e2100000-0000-0000-0000-00000000${RUN_ID: -4}"
TARGET_DATE=$(date -v+35d +%Y-%m-%d 2>/dev/null || date -d "+35 days" +%Y-%m-%d)
N_CALLERS=50
TMPDIR_RUN=$(mktemp -d)

cleanup() {
  psql "$DB_URL" -v ON_ERROR_STOP=0 -q <<SQL > /dev/null 2>&1 || true
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role','admin'), 'aal','aal2')::text, true);
delete from public.notifications where domain_event_id in (select id from public.domain_events where aggregate_type = 'booking' and aggregate_id in (select id from public.bookings where listing_id = '$LISTING_ID'));
delete from public.domain_events where aggregate_type = 'booking' and aggregate_id in (select id from public.bookings where listing_id = '$LISTING_ID');
delete from public.bookings where listing_id = '$LISTING_ID';
delete from public.booking_quotes where listing_id = '$LISTING_ID';
delete from public.inventory_reservations where inventory_id in (select id from public.inventory where departure_id in (select id from public.departures where listing_id = '$LISTING_ID'));
delete from public.departures where listing_id = '$LISTING_ID';
delete from public.listings where id = '$LISTING_ID';
delete from public.agency_verification where agency_id = '$AGENCY_ID';
delete from public.agencies where id = '$AGENCY_ID';
delete from auth.users where email like 'ucc-${RUN_ID}-%@test.com';
SQL
  rm -rf "$TMPDIR_RUN"
}
trap cleanup EXIT

echo "Setting up fixtures (agency $AGENCY_ID, listing $LISTING_ID, no daily_booking_limit, date $TARGET_DATE)..."

psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
begin;
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'app_metadata', json_build_object('role','admin'), 'aal','aal2')::text, true);
insert into public.agencies (id, legal_name, display_name, slug, city, district)
values ('$AGENCY_ID', 'UCC Agency $RUN_ID', 'UCC Agency $RUN_ID', 'ucc-agency-$RUN_ID', 'Kathmandu', 'Kathmandu');
insert into public.agency_verification (agency_id, status, submitted_at, reviewed_at)
values ('$AGENCY_ID', 'approved', now(), now());
insert into public.listings (id, agency_id, slug, title, description, category, location, duration_label, duration_days, base_price, max_participants, difficulty, status)
values ('$LISTING_ID', '$AGENCY_ID', 'ucc-listing-$RUN_ID', 'UCC Concurrency Listing', 'A fixture listing with a description long enough to satisfy the schema check constraint for this table.', 'Cultural', 'Kathmandu', '1 day', 1, 10000, 500, 'Easy', 'published');
commit;
SQL

for i in $(seq 1 "$N_CALLERS"); do
  II=$(printf "%012d" "$i")
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL > /dev/null 2>&1
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('e2000000-0000-0000-0000-${II}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ucc-${RUN_ID}-${II}@test.com', '{"role": "traveler"}'::jsonb, '{}'::jsonb, false, now(), now(), '', '', '', '')
on conflict (id) do nothing;
SQL
done
echo "Created $N_CALLERS traveler fixtures."

echo "Firing $N_CALLERS genuinely parallel create_booking_hold calls (background psql processes)..."
pids=()
for i in $(seq 1 "$N_CALLERS"); do
  II=$(printf "%012d" "$i")
  (
    psql "$DB_URL" -v ON_ERROR_STOP=1 -t -A -q <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e2000000-0000-0000-0000-${II}', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select booking_id from public.create_booking_hold(
  '$LISTING_ID'::uuid, '$TARGET_DATE'::date, 1,
  jsonb_build_object('full_name', 'UCC Caller $i', 'contact_email', 'ucc-${RUN_ID}-${II}@test.com', 'contact_phone', '+97798$(printf "%06d" "$i")')
);
commit;
SQL
  ) > "$TMPDIR_RUN/caller_$i.out" 2> "$TMPDIR_RUN/caller_$i.err" &
  pids+=($!)
done

for pid in "${pids[@]}"; do
  wait "$pid" || true
done
echo "All $N_CALLERS callers finished."

SUCCESS_COUNT=0
for i in $(seq 1 "$N_CALLERS"); do
  if [ -s "$TMPDIR_RUN/caller_$i.out" ] && ! grep -qi "ERROR" "$TMPDIR_RUN/caller_$i.err"; then
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  fi
done

if [ "${DEBUG:-}" = "1" ] && [ "$SUCCESS_COUNT" -lt "$N_CALLERS" ]; then
  for i in $(seq 1 "$N_CALLERS"); do
    if grep -qi "ERROR" "$TMPDIR_RUN/caller_$i.err" 2>/dev/null; then
      echo "--- caller $i stderr ---"; cat "$TMPDIR_RUN/caller_$i.err"
      break
    fi
  done
fi

DB_COUNT=$(psql "$DB_URL" -t -A -q -c "select count(*) from public.bookings where listing_id = '$LISTING_ID' and booking_status = 'pending_payment';")

echo ""
echo "Successful holds (client-observed): $SUCCESS_COUNT"
echo "Pending-payment bookings in the DB: $DB_COUNT"

if [ "$SUCCESS_COUNT" -eq "$N_CALLERS" ] && [ "$DB_COUNT" -eq "$N_CALLERS" ]; then
  echo "PASS: all $N_CALLERS genuinely concurrent callers succeeded against an unlimited-capacity date."
  exit 0
else
  echo "FAIL: expected all $N_CALLERS to succeed, got $SUCCESS_COUNT (client) / $DB_COUNT (DB)."
  exit 1
fi
