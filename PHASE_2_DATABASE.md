# Into Nepal — Phase 2: Database Redesign and Migrations

**Status: complete and validated against a real local Postgres instance.** This phase implemented the entity model from `PHASE_1_ARCHITECTURE.md` as an ordered, idempotent Supabase CLI migration sequence, replacing every loose `supabase/*.sql` / `supabase_*.sql` file from the old architecture. Nothing in this phase touched the live/remote Supabase project or the running application — everything was built and tested against a local Docker-based Postgres instance (`supabase start`), which has since been stopped. The existing app continues to run against its current remote database, completely unaffected, until a future phase actually cuts over.

---

## What changed

**Added — `supabase/migrations/` (17 files, 41 tables, fully applied and tested locally):**

| File | Bounded context |
|---|---|
| `20260916000001_extensions_and_helpers.sql` | Extensions + role/authorization helper functions (`is_admin()`, `has_agency_access()`, etc.) |
| `20260916000002_identity.sql` | `profiles` |
| `20260916000003_agency_management.sql` | `agencies`, `agency_users`, `agency_documents`, `agency_verification`, `agency_status_history` |
| `20260916000004_catalog.sql` | `listings`, `listing_images`, `departures`, `blackout_dates`, `seasonal_pricing`, `price_overrides` |
| `20260916000005_inventory.sql` | `inventory`, `inventory_reservations`, atomic hold/confirm/release functions |
| `20260916000006_quoting.sql` | `booking_quotes`, `quote_items` |
| `20260916000007_booking.sql` | `bookings`, `booking_guests`, `booking_items`, `booking_status_history`, 4 state-machine guard triggers |
| `20260916000008_payments.sql` | `payments`, `payment_attempts`, `payment_events` |
| `20260916000009_refunds.sql` | `refunds`, `refund_events` |
| `20260916000010_financial_ledger.sql` | `financial_ledger` (privilege-revoked immutability) |
| `20260916000011_settlement_and_payouts.sql` | `platform_settings` (+ seed data), `payouts`, `payout_items`, `agency_earnings` view, settlement eligibility function |
| `20260916000012_reviews.sql` | `reviews`, `review_votes`, `review_photos` |
| `20260916000013_messaging.sql` | `conversations`, `conversation_participants`, `messages`, `message_attachments` |
| `20260916000014_notifications.sql` | `domain_events`, `notification_preferences`, `notifications` |
| `20260916000015_admin_and_audit.sql` | `audit_logs`, `platform_settings_history` |
| `20260916000016_storage_buckets.sql` | 5 storage buckets + policies |
| `20260916000017_wishlists_and_contact.sql` | `wishlists`, `contact_submissions` (reused as-is, per Phase 0 §8) |

**Also added:**
- `supabase/config.toml`, `supabase/.gitignore` (via `supabase init`)
- `supabase/schema.types.ts` — generated TypeScript types for the new schema, for later phases to build against. **Not wired into `src/` yet** — that's Phase 3+ work.

**Removed (`git rm`, fully recoverable from git history):**
- All 35 files under `supabase/*.sql` (the old loose migrations) and 5 root-level `supabase_*.sql` files.
- `MIGRATION_ORDER.md` (described the now-removed files).
- `supabase/.temp/*` untracked from git (build-local CLI cache; now correctly gitignored, files remain on disk).

**Modified:**
- `README.md` §3b/§3c and the project-structure tree — updated to describe the new `supabase db push`/`supabase/migrations/` workflow instead of "paste these 4 files into the SQL Editor." I deliberately did **not** rewrite the rest of the README (Stripe setup, edge-function list, portal descriptions) — those describe things Phases 3–19 haven't touched yet, and rewriting them now would either be guesswork or scope creep beyond "database redesign and migrations."

**Untouched, deliberately:** `src/` (entire frontend), `supabase/functions/` (all 13 edge functions, including Stripe-dependent ones), `.env.local`, and the live/remote Supabase project. The current application keeps running exactly as it did before this phase — it simply doesn't know this new schema exists yet.

---

## How this was verified (not just "written and assumed correct")

Per your standing instruction to typecheck/lint/test/check migrations/check RLS after every change, and because this is financial infrastructure: I started a local Supabase stack (Docker) and actually ran every migration against it, rather than only writing SQL and hoping.

1. **`supabase db reset`** — applied all 17 migrations in order, in a loop, after every batch of new files, catching and fixing three real bugs *before* they became "done":
   - `financial_ledger`'s immutability comment (`REVOKE ... FROM PUBLIC`) turned out to be a no-op — Supabase grants table privileges directly to `anon`/`authenticated`/`service_role`, not via `PUBLIC`. Confirmed by querying `information_schema.table_privileges` against the running instance, then fixed to revoke from the three real roles explicitly.
   - `is_booking_settlement_eligible()` referenced `platform_settings`, a table that didn't exist yet at that point in the migration order — `LANGUAGE sql` functions are validated against the schema at creation time (confirmed by the actual error), unlike `plpgsql`. Fixed by pulling `platform_settings`'s table definition forward into the migration that needed it.
   - `audit_financial_change()` was reused as a trigger on both `bookings` and `payouts`, but it references `booking_status`/`payment_status`/etc. — columns that don't exist on `payouts`. This would not have failed at migration-apply time (plpgsql doesn't validate `OLD`/`NEW` field references until a row is actually updated) — it would have shipped silently and only broken the first time a real payout's status changed in production. Caught only by actually updating a test payout row and watching it work. Fixed with a dedicated `audit_payout_status_change()` function.
2. **`supabase db lint`** — no schema errors.
3. **RLS coverage check** — queried `pg_class`/`pg_policies` directly: confirmed all 41 tables have RLS enabled, and none has RLS enabled with zero policies (which would silently lock out every role, including admins, on that table).
4. **Functional/concurrency smoke tests**, with real inserted rows:
   - Two genuinely concurrent `hold_inventory()` calls racing for the last available spot on a departure — exactly one succeeded, the other received a clean `INSUFFICIENT_INVENTORY` error, and `capacity_held` ended at exactly the correct value. This is the literal test target §51 asks for ("two users buying final seat... System must have deterministic outcomes") and directly validates the fix for `AUDIT_REPORT.md` AVAIL-01/AVAIL-02.
   - Attempted `UPDATE financial_ledger` as `service_role` (which bypasses RLS) — rejected with `permission denied for table financial_ledger`, confirming immutability is enforced at the privilege layer, not just RLS, so even a compromised or buggy service-role function cannot rewrite history.
   - Attempted an invalid `booking_status` transition (`draft` → `confirmed` directly) — rejected by the transition-guard trigger with a clear error, confirming invalid states are now impossible rather than silently accepted (the exact failure mode of `AUDIT_REPORT.md` PAY-01).
   - Walked a booking through the full valid transition path (`draft → pending_payment → payment_processing → confirmed`) — succeeded, and correctly wrote to `audit_logs` via the financial-change trigger at each step.
5. **TypeScript validity** — `tsc --noEmit` against the generated `schema.types.ts` — compiles cleanly.

---

## Direct fixes to prior audit findings

| Audit finding | How this phase addresses it |
|---|---|
| `AVAIL-01`/`AVAIL-02` (double-decrement/restore) | New schema has exactly one write path per inventory operation (`hold_inventory`/`confirm_reservation`/`release_reservation`); no trigger duplicates it. Verified under real concurrency (above). |
| `SCHEMA-01` (GENERATED column conflict) | Financial fields live only on `booking_quotes`, joined by `bookings.quote_id` — never duplicated as mutable/generated columns on `bookings` itself. |
| `RLS-01` (unguarded admin analytics RPCs) | Not yet recreated in this schema (the old `admin_dashboard_rpc.sql` functions were deleted with the rest of the legacy files) — when Phase 25 (Admin dashboard) rebuilds this reporting, it must query through RLS-scoped views/service-role functions with an explicit role check, not repeat the old mistake. Flagged here so it isn't forgotten by the time that phase starts. |
| `RLS-02` (`listings` admin policy on `user_metadata`) | New `listings_admin_all` policy uses `is_admin()` exclusively — there is no separate, second admin policy on this table for a future migration to forget to update. |
| `RLS-03` (reviews eligibility not enforced server-side) | `reviews_traveler_insert_eligible_only`'s `WITH CHECK` requires a real, owned, `completed` booking matching the reviewed listing — not just `auth.uid() = traveler_id`. |
| `RLS-04` (messages UPDATE with no `WITH CHECK`) | `lock_message_content` trigger unconditionally re-pins `content`/`sender_id`/`conversation_id`/`created_at` to their prior values on every UPDATE — only `read_at` can actually change. |
| `AUTH-07`/`AUTH-11` (`user_metadata` drift across files, non-idempotent policies) | Every role check in the new schema goes through `current_platform_role()`/`is_admin()`/etc. — one function, called everywhere, reading only `app_metadata`. Every `CREATE POLICY` is preceded by `DROP POLICY IF EXISTS`; the whole migration set was re-run (`db reset`) repeatedly while building it, confirming idempotency in practice, not just by convention. |
| `OPS-03` (untracked `agency-docs` bucket) | `agency-documents` bucket and its policy are now defined in `20260916000016_storage_buckets.sql`, reviewable and reproducible. |
| `OPS-04`/`OPS-05`/`OPS-06` (no migration ordering; audit-log attribution gaps) | Real Supabase CLI migrations directory; `audit_logs.actor_id` is populated wherever an authenticated request context exists, and `record_audit_log()` exists for edge functions (Phase 3+) to call explicitly for service-role-driven actions. |
| `PAY-02` (duplicate cancel/refund logic) | Not yet re-implemented (that's application code, Phase 15) — but the schema now gives it exactly one place to live correctly: `refunds`, independent of `bookings.booking_status`/`refund_status`, so there's no structural reason for two divergent implementations next time. |

Findings this phase does **not** address (out of scope — application/edge-function layer, later phases): `AUTH-01` (MFA/AAL bypass — the `is_authenticated_aal2()` helper exists and is ready to use, but nothing calls it yet since there's no auth flow rebuilt in this phase), `SEC-01`/`AUTH-05` (`get_user_display_names` — not recreated at all, correctly, since messaging in the new schema resolves display names via `profiles.full_name` joined normally rather than a broad RPC), `BIZ-01` (Stripe/NIC ASIA payment provider — Phase 11), CORS inconsistencies (edge functions untouched).

---

## What Phase 2 deliberately did not do

- **No data migration.** Confirmed pre-launch with no live data — this is a clean-slate schema, not an `ALTER`-based transformation of the old tables' contents.
- **No RLS policy for `AGENCY_MANAGER`/`AGENCY_STAFF` beyond the `has_agency_access(min_role)` mechanism already built** — the exact permission boundary between `manager` and `staff` (e.g., can staff edit pricing? can they only view bookings?) is a Phase 3 product decision, not a database-schema one; the mechanism is in place, the policy will need small role-threshold tweaks once that's decided.
- **`is_booking_settlement_eligible()` does not yet check for an explicit "administrative hold" flag** distinct from `settlement_status = 'on_hold'` — target §5 lists "administrative hold" as its own condition; in this schema it's represented as a value of `settlement_status` itself rather than a separate boolean, which is sufficient for now but worth revisiting in Phase 18 if a hold needs richer metadata (who placed it, why, when it expires) than the state machine alone captures.
- **No pg_cron jobs scheduled.** `expire_stale_reservations()` and `expire_stale_quotes()` exist and work (tested manually), but nothing calls them on a schedule yet — that's an operational/deployment concern (Phase 19's payout cron replaces the old `reaper_cron.sql` pattern; inventory expiry needs an equivalent, to be wired when the create-quote/create-payment edge functions exist to actually produce HELD reservations worth expiring).
- **`booking_guests`/`booking_items` were built** (Phase 0 open question #4 was left unresolved by you) — decided to build them since they're additive and low-cost to have even if unused initially, rather than block on an answer; if per-guest/multi-item detail turns out to be unnecessary for launch, these tables simply stay empty rather than causing a schema change later.

## Risks / things to verify before Phase 3

- **NIC ASIA settlement/merchant model is still unknown** (Phase 0 open question #2) — `agencies.payout_account_reference` and `payouts.provider_payout_reference` are deliberately opaque `text` columns precisely because this is unresolved; once real docs arrive, confirm these column types are actually sufficient (e.g., if NIC ASIA needs structured multi-field payout-account data rather than one opaque string, this needs a follow-up migration before Phase 19).
- **Local Supabase CLI version is outdated** (2.98.1 vs. 2.117.0 available) — noted by the CLI itself on every command; worth updating before Phase 3 to avoid hitting a bug already fixed upstream.
- **The remote/live Supabase project this repo is actually linked to** (`supabase/.temp/linked-project.json`, before I removed it from git tracking) still pointed at a stale project ref (`ikytnriurjcfpoktlkfo`, "YatraNepal") that doesn't match `.env.local`'s actual project — this is the same `OPS-11` finding from the original audit, still unresolved, and now more important than before: **do not run `supabase db push` against this local CLI link without first confirming which remote project it should actually target.**

Waiting for your go-ahead before Phase 3 (Authentication, roles and authorization).
