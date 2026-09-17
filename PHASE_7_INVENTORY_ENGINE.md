# Into Nepal — Phase 7: Inventory Reservation Engine

**Status: complete and validated end-to-end against the local Supabase stack**, including a real concurrent-request race test of `hold_inventory()` and confirmation that the reservation-expiry sweep runs automatically, on schedule, with zero manual intervention — not just that the underlying function works when called by hand. This is a database-only phase: no frontend code changed. It closes the one operational gap left in Phase 2's already-correct inventory design, and proves under real concurrency (not just by reading the code) that the "six travelers, five spots" scenario `PHASE_1_ARCHITECTURE.md` §10 describes as the reason this table exists actually resolves the way it's supposed to.

---

## Why this phase exists

`hold_inventory()`/`confirm_reservation()`/`release_reservation()`/`expire_stale_reservations()` (and their quote-layer counterpart, `expire_stale_quotes()`) were all built correctly in Phase 2 — migration 5's own comments are explicit about the concurrency discipline (single atomic `UPDATE ... WHERE capacity_total - capacity_held - capacity_confirmed >= p_quantity`, row-locked, no separate check-then-write race window) and about the sweep's intended operation ("called on a schedule (pg_cron)"). What Phase 2 never did was actually schedule it. Forensic check (`grep` across every migration for `pg_cron`/`cron.schedule`) confirmed: nothing enables the extension, nothing calls `cron.schedule()`, anywhere. Left as-is, every `HELD` reservation whose 15-minute TTL passes without a completed payment would sit `HELD` forever — permanently locking that capacity out of sale, silently, with no error anywhere to notice it by. This is the same category of defect as `AUDIT_REPORT.md` AVAIL-01/AVAIL-02 (the old system's double-decrement bug): code that is individually correct but never actually wired into the system's real operation.

---

## What changed

**Database (one new migration):**
- `supabase/migrations/20260917000004_inventory_expiry_schedule.sql` (**new**) — `create extension if not exists pg_cron schema extensions;` (installed into the `extensions` schema, matching where `pgcrypto` already landed, rather than `public`), then two `cron.schedule()` calls: `expire-stale-inventory-reservations` (calls `expire_stale_reservations()` every minute) and `expire-stale-booking-quotes` (calls `expire_stale_quotes()` every minute — currently a no-op sweep of an empty table, since `booking_quotes` has no real writer until Phase 9's `create-quote` function exists, but scheduling it now means that phase doesn't also have to remember to). Both swept tables are already indexed on `(status, expires_at) WHERE status = 'held'/'active'` (Phase 2), so an empty sweep is cheap — confirmed by the actual `cron.job_run_details` history showing sub-20ms runs throughout testing.

**Nothing else changed.** No new tables, no new RPCs beyond what Phase 2 already built, no frontend code — this phase is entirely about proving and operationalizing existing, already-correct logic.

---

## How this was verified

This phase's whole point is concurrency and scheduling, so "typecheck passes" isn't meaningful evidence here — the testing is entirely runtime, against the local stack, and specifically designed to catch the class of bug that only appears under real concurrent load or real elapsed time:

1. **The real race condition**, built from scratch as a fixture (a published listing, a departure, 5 units of capacity), then fired as **six genuinely concurrent Postgres connections** (six separate `psql` processes backgrounded and `wait`ed on together, not six sequential calls) each requesting 1 spot via `hold_inventory()`: **exactly 5 succeeded, exactly 1 failed with `INSUFFICIENT_INVENTORY`**, and the final `inventory` row read back `capacity_held = 5, capacity_confirmed = 0` — the literal "six travelers, five spots, only five may succeed" example from `PHASE_1_ARCHITECTURE.md` §10, proven under real concurrency rather than assumed from reading the single-statement-UPDATE pattern.
2. **The full reservation lifecycle**, using one of the five successful holds: built a real `booking_quotes` row and a real `bookings` row (the minimal valid fixture chain `confirm_reservation()`'s FK constraints actually require — not a shortcut, since testing this function meaningfully requires a real `booking_id`, not a placeholder UUID, which my first attempt used and got correctly rejected by the FK constraint), then:
   - `confirm_reservation()` → capacity moved `held → confirmed` correctly.
   - Called a **second time** with the same reservation → confirmed idempotent (no state change, no error) — matches the documented "a webhook replay calling this twice is a safe no-op" contract.
   - `release_reservation()` on the now-confirmed reservation → capacity correctly decremented from `confirmed` (the cancellation-restores-inventory path, distinct from releasing a still-`held` reservation).
3. **The expiry sweep, both manually and — the actual point of this phase — automatically:**
   - Created an already-expired hold (`hold_inventory(..., p_ttl_minutes := -5)`), called `expire_stale_reservations()` directly → reclaimed correctly, reservation row flipped to `status = 'expired'` with `released_at` stamped.
   - Created a **second** already-expired hold, then made **no manual call at all** — just polled `inventory.capacity_held` every 5 seconds. It dropped on its own within one cron cycle.
   - Confirmed this was the genuine scheduled job, not coincidence, by reading `cron.job_run_details` directly: both jobs (`jobid 1`/`jobid 2`) show a clean, unbroken history of `succeeded` runs at one-minute intervals since the migration applied — independent of anything this session called by hand.
   - Read `inventory_reservations` directly at the end to confirm every row's final `status` (`held`/`released`/`expired`) matches exactly what each test action should have produced — not just that the aggregate `inventory` counters looked right.

---

## Direct fixes to prior audit findings

| Finding | Resolution |
|---|---|
| `expire_stale_reservations()`/`expire_stale_quotes()` existed but were never scheduled — a silent, permanent capacity-lock bug waiting to happen the first time a real traveler abandoned checkout | Closed via `pg_cron`, and proven to actually run unattended, not just callable. |

No new bugs were found this phase — Phase 2's inventory design held up under the exact stress test it was built for.

---

## What Phase 7 deliberately did not do

- **Did not build the quote engine, checkout flow, or anything that actually calls `hold_inventory()` from a real user action.** `create-quote` (Phase 9) is what will call it for real; this phase only proved the function itself is safe to call concurrently.
- **Did not touch pricing/`booking_quotes` beyond the minimal fixture needed to test `confirm_reservation()`'s FK.** Price resolution remains Phase 8's job.
- **Did not add monitoring/alerting on the cron jobs themselves.** `cron.job_run_details` is queryable and was used here for verification, but nothing surfaces a failed sweep to anyone — reasonable for now (target §53's observability requirement is explicitly a later-phase concern per Phase 0's own audit), but worth remembering once real money is flowing through these holds.
- **Did not change the 15-minute default TTL or the 1-minute sweep interval.** Both are reasonable defaults inherited from Phase 2's design; revisit only if real usage data suggests otherwise.

## Risks / things to verify before the next phase

- **This phase's `pg_cron` setup was validated only on the local Supabase CLI stack.** A real hosted Supabase project needs `pg_cron` enabled at the project level (via the dashboard or Supabase's own extension-management API) before this migration's `create extension` statement will succeed the same way — worth an explicit check during deployment (Phase 57-ish, per the pattern of prior phases' "verify before real deployment" notes), not assumed to just work identically in production.
- **`expire_stale_quotes()` is scheduled but completely untested against real data**, since `booking_quotes` has none yet. Phase 9, when it builds `create-quote`, should re-verify this sweep specifically (not just assume Phase 7 already proved it) — this phase only proved it runs without erroring on an empty table, which is a much weaker claim than proving it correctly expires a real stale quote.
- **`release_reservation()`'s `p_reason` parameter accepts arbitrary text** but only `'expired'` is treated specially (routes to `status = 'expired'` instead of `'released'`) — every other string, including typos, silently falls into the generic `'released'` bucket. Not a bug (the function's own comment documents this as intentional — cancellation and cart-abandonment are both legitimately "released"), but worth knowing before a future phase's cancellation flow assumes a specific reason string round-trips through to an audit trail somewhere; right now it doesn't.

Waiting for your go-ahead before the next phase.
