# Into Nepal — Phase 0: Forensic Audit of the Existing System

**Purpose of this document:** before any redesign work begins, establish exactly what exists today, exactly how it conflicts with the target architecture described in the redesign brief, and exactly what can be reused vs. must be replaced. This is read-only analysis — no code was changed to produce it. It builds on a prior general-purpose audit (`AUDIT_REPORT.md`, same repo, same date) but is reframed entirely around the *new* target domain model rather than generic bug-hunting; where a finding from that report is directly relevant here it's cited by ID rather than repeated in full.

**How to read this document:** Section 1 states the single most important fact this audit surfaced — the existing commercial/financial model is not a variant of the target model, it is a *different* model. Everything else follows from that. Sections 2–7 are the gap analysis. Section 8 is what's safe to keep. Section 9 is the Stripe removal inventory. Section 10 is open questions that block responsible Phase 1 work.

---

## 1. The core conflict: two structurally different payment models

The existing system and the target system are **not** the same model with different numbers — they move money through the platform in fundamentally different shapes.

**Existing model (as implemented today):**
```
Traveler pays the FULL product price ($100) to Into Nepal, upfront, via one Stripe PaymentIntent.
    ↓
Into Nepal holds all $100.
    ↓
commission_amount = total_amount × 15%   ($15 — computed as a GENERATED column)
net_payout        = total_amount − commission_amount   ($85)
    ↓
Later, an admin manually triggers process-payout, which Stripe-Transfers the agency's
accumulated net_payout ($85 across however many bookings) to their Stripe Connect account.
```
Here, the 15% is a **take-rate deducted from a single upfront full payment**. The agency never sees or handles the $85 leg directly — it always flows through the platform, and the platform always fronts full custody of the $100 the instant the traveler pays.

**Target model (per redesign brief §1–§5):**
```
Traveler pays ONLY $15 to Into Nepal, upfront, via NIC ASIA — this alone confirms the booking.
    ↓
$15 is booked immediately as Into Nepal's own revenue (a reservation/booking fee, not a
deposit against the $100 — the brief is explicit and repeated on this point).
    ↓
The remaining $85 is a SEPARATE traveler obligation to the AGENCY, satisfiable two ways:
    (A) DIRECT_TO_AGENCY — traveler pays the agency directly (cash/bank/etc.); Into Nepal
        never holds this money and it is never platform revenue, merely tracked for
        reporting.
    (B) INTO_NEPAL_PLATFORM — traveler pays the $85 through Into Nepal; this makes it
        "agency funds collected" / "agency payable" (a liability the platform owes the
        agency), settled 14 days after trip completion — still never platform revenue.
```
Here, the 15% is a **separate, smaller, mandatory reservation fee that is itself the entire point of the first payment**, and the $85 either never touches the platform at all, or touches it only as a pass-through liability with a 14-day hold.

**Why this distinction is load-bearing for every phase that follows:** almost every piece of existing financial infrastructure — the `commission_amount`/`net_payout` GENERATED columns, the single `payment_intent_id` field, `process-payout`'s "sum up net_payout across confirmed+paid bookings" logic, the entire Stripe PaymentIntent-then-Transfer flow — is built around "one payment, then a deducted payout." None of it can be reused as-is for "two independent payment legs, only one of which is ever platform revenue, with the second having two different collection paths and a 14-day settlement hold." This is not a patch; it is the reason §Non-negotiable-rules #7 in the brief ("treat agency's $85 as Into Nepal revenue" — never) and the entire ledger requirement (§9) exist. **Phase 1 must design the quote, payment, and ledger schema around two independent obligations per booking, not one.**

---

## 2. Domain model gap analysis (target §7 vs. current schema)

Legend: ✅ exists and is broadly reusable · 🟡 exists but needs restructuring · ❌ does not exist, must be created · ⚠️ exists but conflicts with the target model and must be replaced, not extended.

| Target entity | Current state | Notes |
|---|---|---|
| PROFILES | 🟡 `profiles` table exists (`schema.sql`) but is confirmed **dead code** — no application code queries it (see `AUDIT_REPORT.md` AUTH-08). Identity currently lives entirely in `auth.users` metadata. | Decide whether to resurrect `profiles` as the real identity table (recommended, gives a stable place for non-auth identity fields) or continue relying on `auth.users`. |
| AGENCIES | ⚠️ No dedicated `agencies` table exists. `agency_applications` (from `supabase_migration.sql`) conflates *the application* and *the business entity* into one row/table — status lives on the same row as the business profile. | Target model wants a separate `AGENCIES` entity distinct from the application/verification history. Needs splitting. |
| AGENCY_USERS | ❌ Does not exist. Today, one `auth.users` row *is* one agency (1:1 via `agency_applications.user_id`) — there is no concept of multiple staff per agency. | New table required. This is a real product capability gap, not just schema cleanup (brief explicitly wants `AGENCY_OWNER`/`AGENCY_MANAGER`/`AGENCY_STAFF`). |
| AGENCY_DOCUMENTS | 🟡 Exists as flat columns on `agency_applications` (`license_url`, `pan_url`, `insurance_url`) plus a separate untracked `agency-docs` storage bucket (`AUDIT_REPORT.md` OPS-03). | Target wants a proper child table (one row per document, with type/status/expiry), not three fixed columns. |
| AGENCY_VERIFICATION | 🟡 Exists as a `status` enum column on `agency_applications` (`pending/in_review/verified/rejected/suspended`). | Workable as a *current-state* field but needs the history table below to be meaningful. |
| AGENCY_STATUS_HISTORY | ❌ Does not exist. Status changes today are not recorded anywhere immutable — only the current `status` value and (separately, inconsistently) some `audit_log` rows for a subset of paths. | New table required — this is explicitly called for (brief §7, §22 "all verification actions must be audited"). |
| LISTINGS | 🟡 Exists (`supabase_listings_migration.sql`), single-agency-owned, has a status lifecycle already (`draft/pending_review/published/paused/rejected`) that maps reasonably well onto target §23. Missing `archived`/`approved`-as-distinct-from-`published` states and no revision history. | Reusable core, needs a couple of new states and (optionally) a revision-history table. |
| DEPARTURES | ❌ Does not exist as a concept. Current `availability` rows are just `(listing_id, date, spots_total, spots_remaining, price_override, blocked)` — a date is treated as inventory directly, not as "a scheduled occurrence of a listing" with its own identity separate from its inventory. | Needs to be split: DEPARTURES (the scheduled occurrence — date, cutoff, status) vs INVENTORY (capacity numbers for that departure) as two related but distinct entities, per target §7 and §10. |
| INVENTORY | ⚠️ Exists (`availability.spots_total`/`spots_remaining`) but is currently double-written by two competing, never-reconciled trigger pairs — see `AUDIT_REPORT.md` AVAIL-01/AVAIL-02. This is a live correctness bug, not just a naming mismatch. | Must be rebuilt on a single atomic claim/release path (the existing `claim_availability_spots()`/`release_availability_spots()` RPC design from `availability_spot_tracking.sql` is architecturally *correct* — it should become the sole write path once the two legacy triggers are deleted, not reinvented). Needs explicit `HELD/CONFIRMED/RELEASED/EXPIRED` states, which don't exist today (today it's just a raw integer decrement, no state machine). |
| BLACKOUT_DATES | ❌ No dedicated table. `availability.blocked` (boolean) is a coarse per-date flag on the same row as capacity, not a distinct concept. | New table recommended for clarity, though the existing `blocked` flag is a reasonable starting point conceptually. |
| PRICING_RULES / SEASONAL_PRICING / PRICE_OVERRIDES | 🟡 Only `availability.price_override` exists (a single nullable numeric per date). No seasonal-range pricing, no rule engine. | Mostly greenfield — needs real design work in Phase 8. |
| BOOKING_QUOTES / QUOTE_ITEMS | ❌ **Does not exist at all.** This is the single largest structural gap. Today, `create-payment-intent` computes price and creates the Stripe PaymentIntent *and* the `bookings` row all in one synchronous step — there is no separate, immutable, expirable quote object that precedes payment. | This is Phase 9's entire job — genuinely new engineering, not a migration of existing tables. |
| BOOKINGS | 🟡 Exists (`supabase_bookings_migration.sql`) with a real schema (`booking_ref`, `trip_date`, `guests`, pricing fields, one combined `status`, one combined `payment_status`). Structurally close to what's needed but **conflates concerns the target model explicitly wants separated** (§12: booking status, payment status, settlement status, refund status must be four independent state machines — today there are two fields doing the job of four). | Reusable as a starting skeleton; needs `settlement_status` and `refund_status` columns added, and needs `commission_amount`/`net_payout`(GENERATED, tied to the old model) removed in favor of the two-obligation model in §1 above. |
| BOOKING_GUESTS | ❌ Does not exist — today `bookings.guests` is just an integer count plus flat `traveler_name`/`traveler_email`/`traveler_phone` snapshot columns; no per-participant records. | New table if per-guest detail (names, ages, passport info for multi-participant bookings) is actually required for this launch — confirm with product before building (see open questions, §10). |
| BOOKING_ITEMS | ❌ Does not exist. Every booking today is implicitly "one listing, one departure" — no concept of multiple line items (e.g. tour + add-on) in a single booking. | Needed if/when extras (§6, "optional extras if later supported") are in scope; can likely be deferred past initial launch given the brief marks extras as a *future* concern. |
| BOOKING_STATUS_HISTORY | ❌ Does not exist as its own table, though `financial_audit_trigger.sql` does automatically log `status`/`payment_status` transitions into the generic `audit_log` table. | A dedicated, booking-scoped, immutable timeline table (target §41) is cleaner than mining a generic audit log; recommend building it. |
| PAYMENTS / PAYMENT_ATTEMPTS / PAYMENT_EVENTS | ⚠️ Today there is exactly one "payment" concept per booking: a single `payment_intent_id` string column directly on `bookings`, plus `webhook_events` (event-id dedup only, no payload/processing-status detail). No concept of multiple attempts (e.g. a failed card retried), and no first-class `PAYMENT_EVENTS` audit trail beyond the dedup table. | This tier needs a real rebuild: `payments` (logical, one per obligation — reservation fee or balance), `payment_attempts` (each provider-facing try), `payment_events` (every callback received, processed or not, for replay/debugging) — matches target §7/§40 closely; current schema cannot express "the traveler's card was declined twice before succeeding" at all. |
| REFUNDS / REFUND_EVENTS | 🟡 Refund *logic* exists (`process-refund`, `cancel-booking` — both computing a days-until-trip tiered refund and calling Stripe) but there is **no `refunds` table** — refund state is only reflected by overwriting `bookings.payment_status` to `refunded`/`paid`. No refund history, no per-refund amount/reason/idempotency-key record, no `REFUND_EVENTS`. | New tables required, matching target §16. Also: per `AUDIT_REPORT.md` PAY-02, the two existing refund code paths have already drifted from each other — a good forcing function to consolidate into one engine while rebuilding this. |
| COMMISSIONS | ⚠️ Exists conceptually as `bookings.commission_rate`/`commission_amount` (GENERATED columns) — but this *is* the old take-rate model from §1, structurally incompatible with the target's "15% reservation fee is not a commission on the $85" framing. | Must be redesigned, not extended — see §1 above. The *concept* of recording the platform's fee is still needed, just shaped completely differently (a fee on the $15 leg, not a deduction from the $85 leg). |
| AGENCY_EARNINGS | ❌ No dedicated summary table — `AgencyEarnings.tsx` computes aggregates live from `bookings.net_payout` on every page load. | Should become a derived/materialized view over the new ledger (§9) once that exists, not a hand-computed page query. |
| PAYOUTS / PAYOUT_ITEMS | ⚠️ `payouts` table exists (`payouts_migration.sql`) but uses `booking_ids UUID[]` as its accounting model — the brief explicitly forbids this exact pattern (§17: "Do NOT use `booking_ids UUID[]` as the primary payout accounting model"). | Must be replaced with a normalized `payout_items` join table (one row per booking/earning-item per payout) for correct idempotency and auditability. |
| FINANCIAL_LEDGER | ❌ **Does not exist at all.** The closest thing today is `audit_log` (generic, not money-shaped) and `financial_audit_trigger.sql` (logs booking status *transitions*, not structured debit/credit ledger entries). | This is Phase 16's entire job — genuinely new, foundational engineering. Given §9's requirements (immutable, reconstructable financial state, compensating entries for refunds), this should probably be built *before* the quote/payment engines that will write to it, or at minimum designed in lockstep with them. |
| REVIEWS / REVIEW_VOTES / REVIEW_PHOTOS | 🟡 `reviews` exists and is largely reusable, but has a confirmed live gap: the INSERT policy doesn't actually verify a completed booking server-side (`AUDIT_REPORT.md` RLS-03) — eligibility is only checked in frontend code, which is exactly the "do not trust `verified=true` from client" anti-pattern the brief calls out in §24. `review_helpful_fn.sql` provides an increment RPC, not a real `REVIEW_VOTES` table — so "helpful" is spammable (no per-user dedup). No `REVIEW_PHOTOS` table exists (no photo-attachment support on reviews at all currently). | Fix RLS-03 as part of this rebuild (don't just port the bug forward); add `review_votes` (target explicitly names this table, §24); add `review_photos` if photo reviews are in scope. |
| CONVERSATIONS / CONVERSATION_PARTICIPANTS / MESSAGES / MESSAGE_ATTACHMENTS | 🟡 `conversations`/`messages` exist (`messaging_migration.sql`) with generally correct RLS (`traveler_id`/`agency_id` columns directly on `conversations`, not a separate participants table — works for 1:1 traveler↔agency but doesn't generalize to the new AGENCY_USERS multi-staff model, or to a future traveler↔support channel). One confirmed live gap: the messages UPDATE policy has no `WITH CHECK`, letting a participant rewrite another party's message content (`AUDIT_REPORT.md` RLS-04). No message attachments support exists at all currently. | Needs a real `conversation_participants` join table to support multi-staff agencies and support channels; fix RLS-04; add `message_attachments` with the validation the brief demands in §25 (type/size/authorization, no predictable storage URLs). |
| NOTIFICATIONS / NOTIFICATION_PREFERENCES | 🟡 `notification_preferences` exists and is correctly RLS-scoped. There is **no `notifications` table at all** — "notifications" today means "an email gets sent," full stop; there is no in-app notification record, no read/unread state, no event-driven notification log. | The brief's event-driven notification system (§26, ~20 named events) is largely new engineering — today's "notification system" is really just ad hoc email-sending scattered across edge functions and DB triggers. |
| AUDIT_LOGS | 🟡 Exists (`audit_log_migration.sql` + `financial_audit_trigger.sql`) and is reasonably well-designed (immutable, `SECURITY DEFINER` trigger-driven for financial events) but has real gaps: `admin_user_id` is always `NULL` for trigger-driven entries (`AUDIT_REPORT.md` OPS-05 — no attribution of *who*), and several sensitive actions (agency role-escalation approval) aren't logged at all (OPS-06). | Reusable foundation; needs the attribution gap closed and coverage extended to every action listed in target §42. |
| WEBHOOK_EVENTS | ✅ Exists (`webhook_events_migration.sql`) and does its one job correctly (event-id dedup, no RLS = service-role-only — a genuinely good, simple design). | Reusable pattern for the NIC ASIA webhook — extend with the richer fields target §40 wants (provider, event type, payload reference, received/processed timestamps, processing status, error) rather than just an id/type/timestamp. |
| DOMAIN_EVENTS | ❌ Does not exist as a concept — there is no internal event bus/table; side effects (emails, availability changes) happen as direct trigger/function calls, not as published events another system component reacts to. | New, genuinely architectural addition — needed to decouple "booking confirmed" from "send emails" the way target §38 describes (confirm transactionally, notify asynchronously via events, retry notification separately from the confirmation transaction). |
| INVENTORY_RESERVATIONS | ❌ Does not exist as a distinct concept — today, "reserving" inventory *is* decrementing `availability.spots_remaining` directly and permanently (well, twice, per AVAIL-01) the moment a payment intent is created, with no separate HELD-with-TTL state and no defined expiry-driven release. `reap-stale-bookings` cancels stale *bookings* after an hour (and triggers the cancel-restore path), which is a coarse, booking-level proxy for what should be a first-class, inventory-level hold with its own expiry. | New table needed to cleanly express target §10/§12's `HELD → CONFIRMED / RELEASED / EXPIRED` state machine, decoupled from the booking row itself. |

**Summary of the gap:** of the ~30 entities named in the target domain model, **3 are genuinely reusable close-to-as-is** (`webhook_events`, `notification_preferences`, the core shape of `listings`), **~10 exist but need real restructuring** (bookings, availability→departures/inventory, agency_applications→agencies+verification+history, reviews, messages/conversations, audit_log, payouts), and **~17 do not exist at all** (agency_users, agency_documents as a real table, booking_quotes/quote_items, booking_guests, booking_items, booking_status_history, payments/payment_attempts/payment_events, refunds/refund_events, agency_earnings, financial_ledger, review_votes, review_photos, conversation_participants, message_attachments, notifications, domain_events, inventory_reservations). This is the honest scope of Phase 1–19: it is closer to building the financial/booking core from scratch on top of a handful of reusable tables than it is to migrating an existing system.

---

## 3. Booking/payment state machine — current vs. required

**Current:** two enum columns directly on `bookings`:
- `status`: `pending_payment | confirmed | completed | cancelled`
- `payment_status`: `unpaid | paid | refunded`

No `settlement_status`, no `refund_status`, and the two existing fields already do double duty (e.g. `payment_status = 'refunded'` is used as both "a refund happened" *and* implicitly closes out the payment lifecycle — there's no way today to represent "partially refunded," "refund requested but not yet processed," or "payment disputed" as the target model requires). There is also no enforced *transition graph* anywhere — both fields are just plain `TEXT ... CHECK (... IN (...))` columns; any code path with UPDATE access can set any value in any order (the RLS/trigger hardening documented in `AUDIT_REPORT.md` restricts *who* can write these fields, correctly, but nothing restricts *which transitions* are valid — e.g. nothing stops a `completed` booking's `status` being set directly back to `pending_payment`).

**Required (target §12):** four independent state machines — booking status, payment status, settlement status, refund status — each with its own enum and an explicit, enforced transition graph that rejects invalid transitions. This is new engineering (Phase 10), not a column rename.

---

## 4. Inventory concurrency — current implementation is architecturally correct in one place, actively broken in two others

This is worth stating precisely because it's easy to either over- or under-credit the existing code:

- **`claim_availability_spots(p_availability_id, p_guests)`** (`availability_spot_tracking.sql`) — a single atomic `UPDATE availability SET spots_remaining = spots_remaining - p_guests WHERE spots_remaining >= p_guests` — is **exactly** the pattern target §10 asks for, and is genuinely race-safe (Postgres row-level locking on the UPDATE makes "check and decrement" indivisible). This should be kept and built on, not replaced.
- **However**, two legacy triggers from the original migration (`trg_booking_insert_decrement`, `trg_booking_cancel_restore`) were never dropped when the atomic RPC was introduced, so **every booking today double-decrements on create and double-restores on cancel** (`AUDIT_REPORT.md` AVAIL-01/AVAIL-02 — already-confirmed, currently-live bugs). Phase 7 must delete these two legacy triggers as step one, before anything else, or all new inventory work will inherit the same double-write bug.
- There is **no `HELD` state with an expiry** today — a "hold" is really just "a booking row exists with `status='pending_payment'`," and release-on-expiry is achieved indirectly, 15 minutes to 1 hour later, by `reap-stale-bookings` cancelling the whole booking (which then triggers — twice, per the bug above — the restore path). This conflates the inventory hold's lifecycle with the booking's lifecycle, which the target model explicitly wants decoupled (`INVENTORY_RESERVATIONS` as its own entity, §7/§10).

---

## 5. Role/authorization architecture — largely reusable pattern, one standalone gap, one systemic gap

The existing app_metadata-based role model (role read from `auth.jwt()->'app_metadata'->>'role'`, never from client-editable `user_metadata`, enforced independently in both RLS policies and edge functions) is the **correct pattern** and matches target §28/§29 closely — this does not need to be reinvented, just extended (adding `AGENCY_MANAGER`/`AGENCY_STAFF`/`SUPPORT`/`FINANCE` alongside the existing `TRAVELER`/`AGENCY_OWNER`(currently just `agency`)/`ADMIN`).

Two gaps carry forward directly relevant to the redesign:
- **`RLS-02`** (`AUDIT_REPORT.md`): the `listings` table's admin policies were never migrated off `user_metadata` — a live, standalone self-escalation vector. Must be fixed as part of, not after, any listings-table rework in Phase 5.
- **`AUTH-01`** (`AUDIT_REPORT.md`): admin MFA is enforced only by client-side redirect logic; no RLS policy or edge function checks the session's authentication-assurance level (AAL) anywhere. Given the redesign introduces `FINANCE`/admin financial controls with explicitly elevated sensitivity (§61 — refunds, payouts, ledger adjustments should have *stronger* authorization than ordinary admin actions), this gap must be closed as a prerequisite for Phase 3, not deferred — building approval workflows for large refunds/manual payouts on top of an MFA-bypassable admin session would be building a stronger door in a wall with a hole already in it.

Multi-tenant IDOR posture (target §29's "Agency A must never access Agency B's data") is currently **good** everywhere it was checked: every agency-scoped table's RLS policy verifies real ownership (`auth.uid() = agency_id`/`agency_user_id`), not a client-supplied filter. This pattern should be the template for the new `AGENCY_USERS`-aware policies (which will need to check "is this user a member of the agency that owns this row," not just "is this user's own id the agency id," once multi-staff agencies exist).

---

## 6. Frontend architecture — reusable shell, payment/checkout layer must be rebuilt entirely

The React Router structure, lazy-loaded route tree, TanStack Query data-fetching pattern (public/traveler side), shadcn/ui component library, and the general Layout/Header/Footer shell are all sound and reusable as-is. Specific reuse/replace assessment:

- **Reusable as-is:** routing structure, `ProtectedRoute` shape (once AAL-aware, per §5 above), the public-side TanStack Query pattern (should be extended to the agency/admin side per `AUDIT_REPORT.md` FE-03, which found the agency/admin Zustand stores have inconsistent staleness behavior — worth fixing while rebuilding those pages for the new domain model anyway), image-upload component shape (once namespacing per FE-04 is fixed), SEO component shape (once canonical-URL support per FE-05 is added).
- **Must be rebuilt, not patched:** `src/lib/stripe.ts`, `src/pages/BookingPayment.tsx` (Stripe Elements `<CardElement>`-based — structurally assumes a single card-present payment step, not a quote→reservation-fee→confirmation→separate-balance flow), `src/components/agency/StripeConnectCard.tsx`, and every page that displays `commission_rate`/`net_payout` as if it were the whole financial story (`AgencyEarnings.tsx`, `BookingDetailSheet.tsx`, `BookingConfirmation.tsx`, `AgencyDashboard.tsx`, `AgencyAnalytics.tsx`, `admin/Bookings.tsx`, `admin/Settings.tsx`) — these all need to be re-derived from the new quote/payment/ledger model, which will change both the underlying data shape and the UI (the target checkout UI in §36 — "TOUR PRICE $100 / PAY NOW TO CONFIRM $15 / REMAINING AGENCY BALANCE $85" — has no equivalent in the current UI, which just shows one total).

---

## 7. Documentation/process debt inherited into the redesign

- **35 loose, unordered SQL files** with no migration-tracking system (confirmed exhaustively in `AUDIT_REPORT.md` OPS-04/AUTH-07/AUTH-11) — this must not be perpetuated. Target §46 explicitly requires "one authoritative migration sequence." **Recommendation: Phase 2 should start by moving to the Supabase CLI's real `supabase/migrations/` timestamped structure and retiring every loose file in favor of it, rather than adding a 36th loose file.**
- **Stale brand/domain references** (`yatranepal.com`, `hello@yatranepal.com`) hardcoded in 8+ places (`AUDIT_REPORT.md` FE-06) — target §35 wants a single centralized brand/domain/email source; this is a good forcing function to finally fix it while touching these files anyway.
- **Zero automated tests, zero error monitoring** (`AUDIT_REPORT.md` OPS-01/OPS-02) — given target §52's extensive test-suite requirement and §53's observability requirement, and given how much *new*, *financially critical* code this redesign will introduce, **test infrastructure and error monitoring should be stood up early (ideally alongside Phase 2/3), not deferred to Phase 31/32 as the phase numbering might suggest** — writing the quote engine, payment layer, and ledger without any test harness in place would repeat the exact failure mode that produced `AUDIT_REPORT.md` PAY-01 (a bug that would have been caught by one integration test, and instead ran silently in production since the file's first commit).

---

## 8. What is safe to keep and build on (do not rebuild these)

Stated explicitly, since the brief warns against blind patching *and* against unnecessary rewrites:
- The `app_metadata`-based role/auth pattern (§5 above).
- The atomic `claim_availability_spots`/`release_availability_spots` RPC design (§4 above) — keep the *pattern*, delete the *legacy triggers* that conflict with it.
- `webhook_events` table shape (extend, don't replace).
- Vault-based bank-account-number encryption (`agency_bank_details`/`set_bank_account` RPC) — genuinely correctly implemented already, confirmed in prior audit.
- Email-escaping discipline in `_shared/html.ts`/`emailTemplates.ts` — consistently applied, keep the pattern for new templates (booking quote, reservation-fee-paid, balance-due, settlement-eligible, etc.).
- Storage RLS pattern for `agency-logos`/`user-avatars` (folder-name-equals-uid scoping) — extend to new buckets (message attachments, review photos) rather than inventing a new pattern.
- `platform_settings` table shape (key/value/audited-by) — reusable as the home for the new configurable business rules in §43 (booking fee percentage, settlement delay days, etc.), once its remaining `user_metadata` RLS policy is fixed (already covered by `fix_security_use_app_metadata.sql`, per prior audit).
- Frontend routing/component shell (§6 above).

---

## 9. Stripe removal inventory (target §47, §66)

Every file touching Stripe, confirmed by repo-wide search — this is the exact surface area Phase 11 must remove/replace:

**Backend (7 files):**
- `supabase/functions/stripe-webhook/index.ts` — entire file removed, replaced by `supabase/functions/nic-asia-webhook/`.
- `supabase/functions/stripe-connect-onboard/index.ts` — removed; NIC ASIA's merchant/settlement model (unknown until docs are available — see open questions) determines what, if anything, replaces this.
- `supabase/functions/create-payment-intent/index.ts` — removed, replaced by the new `create-quote`/`create-payment` functions (target §49); note this file's *non-Stripe* logic (server-side price lookup, atomic availability claim) is exactly what should be preserved and carried into the new function, per §8 above — this is a rewrite of the payment-specific parts, not a discard of the whole file's logic.
- `supabase/functions/cancel-booking/index.ts` — Stripe refund calls removed, replaced by the new provider-abstracted `PaymentService.refundPayment()`.
- `supabase/functions/process-refund/index.ts` — same; also a candidate for merging with `cancel-booking` regardless of payment provider, per `AUDIT_REPORT.md` PAY-02.
- `supabase/functions/process-payout/index.ts` — Stripe Transfer calls removed; payout mechanism depends entirely on NIC ASIA's actual settlement/payout capabilities (open question).
- `supabase/functions/_shared/emailTemplates.ts` — Stripe-specific wording (if any) in payout/refund email copy needs review, not necessarily removal (need to check exact content in Phase 11).

**Frontend (12 files):**
- `src/lib/stripe.ts` — removed, replaced by a NIC ASIA client module.
- `src/pages/BookingPayment.tsx` — rebuilt around NIC ASIA's redirect/hosted-payment or SDK model (unknown until docs available) and the new quote→reservation-fee flow, not a card-element form.
- `src/components/agency/StripeConnectCard.tsx` — removed/replaced with a NIC ASIA-appropriate payout-account-setup UI, shape depends on open questions below.
- `src/stores/agencyStore.ts` — remove Stripe Connect account-id handling, replace with the new payout-account model.
- `src/pages/agency/AgencyEarnings.tsx`, `src/pages/agency/AgencySettings.tsx`, `src/pages/admin/bookings/BookingDetailSheet.tsx` — remove Stripe dashboard deep-links / Stripe-specific status display, replace with NIC ASIA-equivalent references once known.
- `src/pages/TermsOfService.tsx`, `src/pages/PrivacyPolicy.tsx`, `src/pages/CookiePolicy.tsx`, `src/pages/CancellationPolicy.tsx`, `src/pages/FAQ.tsx` — legal/policy copy mentioning Stripe needs rewriting for NIC ASIA and for the new two-payment-leg model generally (target §60 — must not describe the 15% as refundable unless actually true, must explain the fee/balance split accurately).

**Dependency:** `@stripe/react-stripe-js` in `package.json` — remove once `BookingPayment.tsx` no longer needs it.

---

## 10. Open questions that must be answered before Phase 1 can be responsibly executed

These are not things I can resolve by reading the existing codebase further — they require your input, business/legal confirmation, or vendor documentation that isn't part of this repository.

1. **NIC ASIA technical documentation.** The brief is explicit and repeated: "Do not invent NIC ASIA API fields," "Use official NIC ASIA technical documentation/configuration." I have none. Do you have API docs, a sandbox/merchant account, or a technical contact at NIC ASIA to share? Until then, Phase 11's `NICAsiaProvider` implementation can only be stubbed behind the `PaymentProvider` interface with placeholder methods that throw "not yet implemented" — the interface/abstraction itself (§3, §15) can be designed now, but the real integration cannot.
2. **NIC ASIA settlement/merchant arrangement.** The brief itself flags this (§5): "confirm the actual NIC ASIA merchant/marketplace/settlement arrangement... before production implementation." This determines whether the platform can even receive the $85 balance leg on the agency's behalf at all (does NIC ASIA support a marketplace/split-payment or sub-merchant model, or would `INTO_NEPAL_PLATFORM`-method balance collection need a different mechanism entirely?), and whether agency payouts happen via NIC ASIA at all or via a separate bank-transfer process. This materially changes Phase 14/19's design.
3. **Nepal regulatory/accounting requirements** for holding agency funds in transit (the 14-day settlement hold) — the brief flags this too (§5). Is there existing legal/accounting guidance, or does this need to be sourced before Phase 16–19 are built?
4. **Scope confirmation for `BOOKING_GUESTS`/`BOOKING_ITEMS`.** Is multi-participant per-guest detail (names/ages/passport numbers) and multi-item bookings (tour + add-ons) required for initial launch, or can these be deferred? This materially affects Phase 10/11 scope.
5. **Pace/checkpoint expectations.** Given the scope (34 phases, each with its own 19-step execution rule per §65), do you want phase-by-phase execution with a report/checkpoint after each phase (my default assumption, and what I'll do unless told otherwise), or batched execution across several phases at once before reporting back? Given the financial/security stakes here and the brief's own emphasis on not assuming and not skipping steps, I'd recommend the former.
6. **Existing production data.** Is there real traveler/agency/booking data in the live database today that must be migrated forward (not just schema-migrated, but data-migrated into the new quote/payment/ledger shape), or is this redesign happening before real launch/production traffic, making a clean cutover possible? This significantly changes the risk profile and required care of Phase 2.

---

## Recommendation

Phase 0 is complete. I'd suggest Phase 1 (Architecture and domain redesign) start from the gap table in §2 above, resolve open questions 1–2 and 4–6 first (3 can run in parallel/later), and produce a concrete schema design (table-by-table DDL sketch, not yet a migration) for review before any migration is actually written in Phase 2 — given how much of this is genuinely new (§2's "~17 entities don't exist at all"), getting the shape right on paper first is cheaper than iterating on live migrations.

I have not modified any code. Waiting for direction on the open questions above, and on how you'd like Phase 1 scoped, before proceeding.
