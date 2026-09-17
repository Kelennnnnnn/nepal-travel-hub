# Into Nepal — Phase 1: Architecture and Domain Redesign

**Status:** design only — no database changes, no code changes in this phase. This document is what Phase 2 (database redesign and migrations) will implement as actual DDL, and what Phases 3–19 will build application logic against. Builds directly on `PHASE_0_FORENSIC_AUDIT.md`'s gap analysis.

**Confirmed constraints from Phase 0 checkpoint:** no live production data (schema can be designed freely, no data-migration constraint); no NIC ASIA docs yet (payment provider is designed as an abstraction with a stubbed implementation); phase-by-phase execution with checkpoints.

---

## 1. Bounded contexts

Rather than one undifferentiated schema, the domain splits into contexts with clear ownership. This determines which tables belong together, which edge functions own which writes, and where transaction boundaries fall (Phase 50 concern, previewed here).

| Context | Owns | Depends on |
|---|---|---|
| **Identity & Access** | `profiles`, roles/permissions, sessions | — |
| **Agency Management** | `agencies`, `agency_users`, `agency_documents`, `agency_verification`, `agency_status_history` | Identity |
| **Catalog** | `listings`, `departures`, `blackout_dates`, `pricing_rules`, `seasonal_pricing`, `price_overrides` | Agency Management |
| **Inventory** | `inventory`, `inventory_reservations` | Catalog |
| **Quoting** | `booking_quotes`, `quote_items` | Catalog, Inventory |
| **Booking** | `bookings`, `booking_guests`, `booking_items`, `booking_status_history` | Quoting, Inventory |
| **Payments** | `payments`, `payment_attempts`, `payment_events`, `webhook_events` | Booking |
| **Refunds** | `refunds`, `refund_events` | Payments, Booking |
| **Financial Ledger** | `financial_ledger` (the one immutable source of truth every other financial view is derived from) | Payments, Refunds |
| **Settlement & Payouts** | `agency_earnings`, `payouts`, `payout_items` | Financial Ledger |
| **Reviews** | `reviews`, `review_votes`, `review_photos` | Booking |
| **Messaging** | `conversations`, `conversation_participants`, `messages`, `message_attachments` | Identity, Booking (context) |
| **Notifications** | `notifications`, `notification_preferences`, `domain_events` | all of the above (consumer) |
| **Admin & Audit** | `audit_logs`, `platform_settings` | all of the above (cross-cutting) |

**Why this matters concretely:** every write to `financial_ledger` must originate from exactly one place per event type (a payment being verified, a refund being processed, a payout being paid) — never from ad hoc UPDATE statements scattered across edge functions the way `bookings.payment_status` is written today from at least 4 different functions. This is the single biggest architectural discipline this redesign introduces relative to the current system.

---

## 2. The two-obligation booking model (concrete schema-level design)

Directly operationalizing Phase 0 §1's finding. A confirmed booking always has **exactly one** `booking_quotes` snapshot and creates **exactly two** financial obligations:

```
booking_quotes (immutable snapshot at quote time)
├── product_value          NUMERIC  -- $100, agency's price, frozen at quote time
├── platform_fee           NUMERIC  -- $15, Into Nepal's reservation fee (computed from
│                                       platform_settings.booking_fee_percentage at quote
│                                       time, then frozen — future rate changes never
│                                       affect an already-issued quote)
├── agency_balance         NUMERIC  -- $85 = product_value - platform_fee
├── currency                TEXT    -- e.g. 'NPR' | 'USD', never assumed
└── ... (expiry, cancellation policy snapshot, balance payment terms snapshot — full
        field list in §5 below)

On booking confirmation, this produces two independent obligations, each tracked
through its own payments/refunds/ledger lifecycle:

  Obligation 1: PLATFORM_FEE                Obligation 2: AGENCY_BALANCE
  ─────────────────────────────             ──────────────────────────────────────
  amount = quote.platform_fee                amount = quote.agency_balance
  payee  = Into Nepal (always)                payee  = Agency
  method = NIC ASIA (always, mandatory        method = DIRECT_TO_AGENCY | INTO_NEPAL_PLATFORM
           to confirm booking)                         (traveler/agency choice, or platform default)
  → always creates a financial_ledger         → DIRECT_TO_AGENCY: tracked for reporting only,
    entry of type INTO_NEPAL_REVENUE            NO ledger cash entry (platform never held it)
                                               → INTO_NEPAL_PLATFORM: creates a financial_ledger
                                                 entry of type AGENCY_FUNDS_COLLECTED, which
                                                 becomes AGENCY_PAYABLE, eligible for
                                                 settlement 14 days after trip completion
```

This is why `payments` (§4 below) needs an `obligation_type` discriminator column (`PLATFORM_FEE` | `AGENCY_BALANCE`) rather than being a single undifferentiated "the booking's payment" concept the way `bookings.payment_intent_id` is today — a booking can have zero, one, or two `payments` rows depending on whether/how the balance was collected, and they must never be confused with each other in reporting or ledger entries.

---

## 3. Entity model (logical design — Phase 2 will translate this into DDL)

Full field-level design for every table Phase 0 identified as missing or needing restructuring. Reused tables (Phase 0 §8) are noted but not re-specified here since their existing shape is being kept.

### 3.1 Agency Management

```
agencies
  id, legal_name, display_name, slug (unique, for SEO-clean URLs — target §34),
  description, city, district, address, phone, email, website,
  status              -- current state, mirrors latest agency_verification row
  stripe_account_id → REMOVED (Stripe gone); payout_account_reference (opaque,
                        provider-agnostic — actual shape depends on NIC ASIA
                        settlement model, open question from Phase 0 §10)
  created_at, updated_at

agency_users
  id, agency_id → agencies, user_id → auth.users,
  role              -- OWNER | MANAGER | STAFF (agency-scoped, distinct from the
                        platform-wide role claim)
  invited_by, invited_at, accepted_at, removed_at (soft — preserve history)
  UNIQUE (agency_id, user_id)

agency_documents
  id, agency_id → agencies, document_type   -- BUSINESS_REGISTRATION | TOURISM_LICENSE |
                                                PAN_CERTIFICATE | INSURANCE | OTHER
  storage_path, mime_type, size_bytes, status  -- PENDING | APPROVED | REJECTED | EXPIRED
  expires_at (nullable — licenses/insurance often have real expiry dates; today's
              flat url columns can't express this at all)
  reviewed_by, reviewed_at, rejection_reason
  created_at

agency_verification
  id, agency_id → agencies (one current row per agency, or track latest via
     agency_status_history and derive current status — decide in Phase 4)
  status            -- DRAFT | SUBMITTED | IN_REVIEW | MORE_INFO_REQUIRED |
                        APPROVED | SUSPENDED | REJECTED   (target §22, exact enum)
  submitted_at, reviewed_by, reviewed_at, rejection_reason, info_requested_note

agency_status_history   -- append-only, one row per transition, never updated
  id, agency_id → agencies, from_status, to_status, changed_by → auth.users
  reason, created_at
  -- INSERT-only via a trigger or the sole edge function permitted to change status;
     no application code ever UPDATEs a row here.
```

**Explicit rule carried forward from target §22:** "Approval must never be controlled by the applicant" — enforced at the RLS level (an agency_user, regardless of role, has no UPDATE grant on `agency_verification.status`; only `admin`/`FINANCE`-equivalent roles via a dedicated edge function do), not just at the application layer. This directly fixes the class of bug `fix_agency_application_rls.sql` had to patch after the fact in the current system (Phase 0 §5) — this time the constraint is designed in from the start.

### 3.2 Catalog

```
listings   -- largely reused shape (Phase 0 §2), add:
  slug (unique per agency or globally — decide in Phase 27/SEO), 
  status adds ARCHIVED and separates APPROVED (admin-cleared) from PUBLISHED
    (agency has actually made it live) per target §23
  current_revision_id (if listing revision history is built)

departures   -- NEW, split out from today's overloaded `availability`
  id, listing_id → listings, agency_id → agencies (denormalized for RLS speed,
     matches the existing pattern already used correctly in `availability`)
  departure_date, cutoff_at (last moment a booking can be made for this departure),
  status         -- SCHEDULED | CLOSED | CANCELLED
  created_at, updated_at

blackout_dates
  id, listing_id → listings, date, reason, created_by

pricing_rules / seasonal_pricing / price_overrides
  -- Phase 8 concern in detail (agency pricing engine is a dedicated phase); logical
     shape for now:
  seasonal_pricing: id, listing_id, season_name, start_date, end_date, price, currency
  price_overrides: id, listing_id, departure_id (nullable — can override at the
     listing+date level even before a specific departure exists), price, currency,
     reason, created_by
  -- Resolution order at quote time (base price → seasonal → override) is a Phase 8
     design decision, not decided here.
```

### 3.3 Inventory

```
inventory   -- replaces availability.spots_total/spots_remaining, one row per departure
  id, departure_id → departures (UNIQUE — one inventory row per departure, unlike
     today's per-listing-per-date model)
  capacity_total, capacity_held, capacity_confirmed
  -- capacity_available is a GENERATED column: capacity_total - capacity_held - capacity_confirmed
  -- Unlike today's bookings_migration commission_amount/net_payout GENERATED-column
     mistake (Phase 0 SCHEMA-01), this generated column is read-only-by-design and
     nothing ever attempts to write it directly — the two atomic RPCs below are the
     only mutation path.
  version (optimistic-lock counter, belt-and-suspenders alongside the atomic UPDATE
     pattern — optional but cheap insurance)

inventory_reservations   -- NEW, the HELD/CONFIRMED/RELEASED/EXPIRED state machine
  id, inventory_id → inventory, booking_id → bookings (nullable until a booking
     row actually exists — a reservation can be held during quote/payment-attempt
     before a booking is created)
  quantity, status        -- HELD | CONFIRMED | RELEASED | EXPIRED
  held_at, expires_at (TTL for the hold — e.g. 15 minutes from quote creation,
     configurable via platform_settings), confirmed_at, released_at

  -- Atomic operations (keeping the *pattern* from claim_availability_spots, per
     Phase 0 §8, but now targeting `inventory` + creating an explicit
     `inventory_reservations` row rather than just decrementing an integer):
  --   hold_inventory(departure_id, quantity, ttl) → reservation_id
  --        UPDATE inventory SET capacity_held = capacity_held + quantity
  --        WHERE departure_id = ... AND capacity_available >= quantity
  --        (atomic check-and-hold, same race-safety property as today's RPC)
  --   confirm_reservation(reservation_id) → moves capacity_held → capacity_confirmed
  --   release_reservation(reservation_id) → moves capacity_held back to 0, status EXPIRED/RELEASED
  --   A scheduled job (replacing today's reap-stale-bookings, but operating on
  --     reservations directly rather than on bookings as a side effect) expires
  --     HELD rows past their expires_at and releases their capacity_held.
```

**Explicit answer to target §10's "define behavior when payment succeeds after a hold has expired":** if `verify-payment` finds the associated `inventory_reservations` row is `EXPIRED` (not `HELD`/`CONFIRMED`), the payment is verified successfully (money was in fact received) but the booking **cannot** auto-confirm — it moves to a distinct `DISPUTED`-adjacent booking status (exact name decided in Phase 10, e.g. `PAYMENT_RECEIVED_INVENTORY_UNAVAILABLE`) that routes to manual admin/support resolution (refund, or re-accommodate if capacity has since freed up), rather than either silently overselling or silently keeping the traveler's money with no booking. This exact scenario is explicitly called out in target §51's concurrency test list and must have a deterministic, non-silent outcome.

### 3.4 Quoting

```
booking_quotes
  id, listing_id → listings, departure_id → departures, agency_id → agencies,
  traveler_id → auth.users, participant_count,
  product_value, platform_fee, agency_balance, currency,   -- see §2 above
  pricing_version (references which pricing_rules/seasonal_pricing/price_overrides
     were resolved, for auditability — "why was this quote this price")
  cancellation_policy_snapshot (JSONB — the resolved policy at quote time; target §16
     requires this be snapshotted, not live-referenced, so a later agency policy
     change never retroactively changes an existing quote's terms)
  balance_payment_terms_snapshot (JSONB — due date, allowed methods, at quote time)
  status          -- ACTIVE | EXPIRED | CONSUMED (turned into a booking) | CANCELLED
  expires_at, created_at
  inventory_reservation_id → inventory_reservations (the HELD row this quote is
     backed by — a quote without live inventory backing should not be issuable)

quote_items
  id, quote_id → booking_quotes, item_type (BASE_PRODUCT | EXTRA — extras are future
     scope per target §6, table exists now so it's not a breaking schema change later),
     description, unit_price, quantity, line_total
```

**Immutability enforcement (target §11 — "Do not allow frontend modification of quote totals"):** `booking_quotes` has no application-facing UPDATE path at all once created — every numeric/snapshot field is written once, at INSERT, by the `create-quote` server function, and RLS grants travelers/agencies SELECT-only. The only "mutation" a quote ever undergoes is a status transition (`ACTIVE → EXPIRED/CONSUMED/CANCELLED`), performed by trusted server functions only, never touching the financial fields.

### 3.5 Booking

```
bookings   -- restructured from today's shape (Phase 0 §2)
  id, booking_ref (kept — human-readable reference, existing generation pattern is fine),
  quote_id → booking_quotes (NEW — every booking traces back to the exact quote
     that produced its frozen financial snapshot),
  listing_id, departure_id, agency_id, traveler_id (denormalized from the quote for
     query/RLS convenience, matching the existing, correct pattern),
  participant_count,
  -- financial fields are now READ from the linked quote, not duplicated as
     mutable columns the way commission_amount/net_payout are today (Phase 0
     SCHEMA-01) — product_value/platform_fee/agency_balance live on
     booking_quotes and are joined, not copied, eliminating the class of bug
     where a booking's "price" could ever drift from its quote.
  booking_status        -- see §4 state machine below
  payment_status         -- see §4 (tracks the PLATFORM_FEE payment specifically —
                             the reservation fee is what actually gates booking_status)
  balance_status          -- NEW: tracks the AGENCY_BALANCE obligation independently
                             (NOT_DUE | DUE | PARTIALLY_PAID | PAID | OVERDUE)
  balance_method          -- DIRECT_TO_AGENCY | INTO_NEPAL_PLATFORM
  settlement_status        -- see §4 (only meaningful when balance_method = INTO_NEPAL_PLATFORM)
  refund_status            -- see §4
  cancelled_at, cancellation_reason
  created_at, updated_at

booking_guests   -- NEW (scope-confirm in Phase 10 per Phase 0 open question #4)
  id, booking_id → bookings, full_name, age (or date_of_birth), 
  passport_number (nullable, encrypted-at-rest if collected — target §62 data
     minimization applies directly here), contact_phone, contact_email, is_primary

booking_items    -- NEW (mirrors quote_items; present now, extras deferred per target §6)
  id, booking_id → bookings, quote_item_id → quote_items, description, unit_price,
  quantity, line_total

booking_status_history   -- NEW, append-only (target §41's booking timeline)
  id, booking_id → bookings, event_type (QUOTE_CREATED | PAYMENT_INITIATED |
     RESERVATION_FEE_VERIFIED | BOOKING_CONFIRMED | AGENCY_NOTIFIED | BALANCE_DUE |
     BALANCE_PAID | TRIP_UPCOMING | TRIP_STARTED | TRIP_COMPLETED |
     SETTLEMENT_ELIGIBLE | PAYOUT_COMPLETED | ... — mirrors target §26's event list
     directly, since booking timeline entries and notification events are largely
     the same underlying occurrences)
  metadata (JSONB), created_at
  -- INSERT-only, written by domain_events consumers (§6 below), never UPDATEd/DELETEd.
```

### 3.6 Payments, Refunds

```
payments   -- one row per obligation-payment-instance (a booking can have 2: platform
              fee + agency balance, if the balance is collected via INTO_NEPAL_PLATFORM)
  id, booking_id → bookings, obligation_type (PLATFORM_FEE | AGENCY_BALANCE),
  amount, currency, provider (NIC_ASIA | ... — future providers per target §3),
  status          -- UNPAID | PENDING | PROCESSING | PAID | PARTIALLY_REFUNDED |
                     REFUNDED | FAILED | EXPIRED | DISPUTED  (target §12, exact enum)
  idempotency_key (UNIQUE — target §39)
  created_at, updated_at

payment_attempts   -- NEW, one row per provider-facing try (retries after a decline, etc.)
  id, payment_id → payments, provider_reference (opaque, provider-specific — never
     assume Stripe-shaped fields, this is exactly why the provider abstraction matters),
  status, initiated_at, completed_at, failure_reason

payment_events   -- NEW, every callback/webhook received, whether or not it changed state
  id, payment_id → payments (nullable — an event might arrive for an unknown/
     not-yet-linked payment and still needs to be stored for debugging/replay),
  provider, provider_event_id (UNIQUE per provider — the idempotency backbone,
     same principle as today's webhook_events but now payment-scoped and richer),
  event_type, raw_payload_reference (store a reference/redacted payload — target §14:
     "store raw provider metadata only where appropriate and safe," never card data),
  received_at, processed_at, processing_status (PENDING | PROCESSED | FAILED | IGNORED),
  error_message

refunds
  id, booking_id → bookings, payment_id → payments, provider_refund_id,
  amount, currency, reason, initiated_by (traveler | agency | admin | system),
  status          -- NONE | REQUESTED | PROCESSING | PARTIALLY_REFUNDED | REFUNDED |
                     FAILED | REVERSED
  idempotency_key (UNIQUE)
  created_at, updated_at

refund_events   -- mirrors payment_events, for refund-specific provider callbacks
  id, refund_id → refunds, provider_event_id (UNIQUE), event_type, received_at,
  processed_at, processing_status
```

**Cancellation vs. refund, kept structurally separate (target §16):** `bookings.booking_status` transitioning toward `CANCELLED` is governed entirely by the booking state machine and the snapshotted `cancellation_policy_snapshot` on the quote (can this booking be cancelled, and under what policy). A `refunds` row is a *consequence* computed from that policy (how much money actually comes back), created by the cancellation-processing function but tracked, verified, and stated independently — a cancellation can exist with a `$0` refund (e.g. `<3 days` per whatever policy was snapshotted), and a refund can later fail/be reversed independently of the booking having already been marked cancelled.

### 3.7 Financial Ledger

```
financial_ledger   -- THE immutable source of truth (target §9)
  id, booking_id → bookings (nullable — payouts reference multiple bookings, so
     not every ledger entry is booking-scoped),
  entry_type      -- PRODUCT_VALUE | INTO_NEPAL_REVENUE | AGENCY_FUNDS_COLLECTED |
                      AGENCY_PAYABLE | REFUND | PAYOUT | ADJUSTMENT   (target §8, exact set)
  amount, currency, direction (DEBIT | CREDIT — even if the platform doesn't need
     full double-entry accounting initially, having the field now avoids a painful
     migration later if/when real accounting reconciliation is required),
  related_payment_id → payments (nullable), related_refund_id → refunds (nullable),
  related_payout_id → payouts (nullable),
  description, created_by (system | specific admin, for ADJUSTMENT entries),
  created_at
  -- NO updated_at. NO UPDATE grant to anyone, ever, on any role, including admin/
     service_role at the RLS layer (enforced by simply never granting UPDATE/DELETE
     privileges on this table to any role — only INSERT, and only from a small,
     audited set of server functions). Corrections are always a new compensating
     row (target §9: "original entry + adjustment/reversal/refund entry"), never
     an edit to history.
```

**Worked example (directly matching target §9's worked example):** traveler books a $100 tour, pays $15 via NIC ASIA, later pays the $85 balance through the platform.
```
1. booking confirmed →  INSERT financial_ledger (entry_type=INTO_NEPAL_REVENUE, amount=15, booking_id=X)
2. balance paid via platform → INSERT financial_ledger (entry_type=AGENCY_FUNDS_COLLECTED, amount=85, booking_id=X)
   → agency_earnings (derived view, §3.8) now shows agency_payable += 85 for this booking
3. if traveler later gets a 100% refund on the $85 leg →
   INSERT financial_ledger (entry_type=REFUND, amount=-85, booking_id=X, related_refund_id=Y)
   -- the original AGENCY_FUNDS_COLLECTED row from step 2 is untouched; the refund
      is a new, compensating row. Reconstructing "what does the agency currently
      owe for booking X" is always SUM(financial_ledger entries WHERE booking_id=X),
      never a mutable running-balance column.
```

### 3.8 Settlement & Payouts

```
agency_earnings   -- derived/materialized (a view or a refreshed summary table, NOT
                     hand-computed live in AgencyEarnings.tsx the way it is today)
  agency_id, gross_collected, refunded, adjustments, net_payable, settled_to_date,
  pending_settlement, computed_at
  -- Definition: SUM of financial_ledger entries by type, grouped by agency_id —
     this table's whole purpose is to be a fast, cacheable reconciliation of the
     ledger, always re-derivable from it, never an independent source of truth.

payouts
  id, agency_id → agencies, status  -- PENDING | PROCESSING | PAID | FAILED | REVERSED
                                        (settlement status enum, target §5/§12)
  total_amount, currency, provider_payout_reference, idempotency_key (UNIQUE),
  period_start, period_end, initiated_by, created_at, completed_at

payout_items   -- REPLACES today's payouts.booking_ids UUID[] (explicitly forbidden
                  by target §17) with a normalized join
  id, payout_id → payouts, booking_id → bookings, financial_ledger_entry_id →
     financial_ledger, amount
  UNIQUE (payout_id, booking_id)  -- structurally prevents the same booking being
     paid out twice within one payout, and (combined with a check against other
     payouts' items before creating a new payout) across payouts too.
```

**Settlement eligibility check (target §5, exact conditions):** a booking's `AGENCY_FUNDS_COLLECTED` ledger entry becomes eligible for inclusion in a payout only when ALL of: `booking_status = COMPLETED`, `payment_status = PAID` for both obligations, `refund_status` is `NONE` (no active refund), no open dispute flag, no active `audit_logs`-recorded administrative hold on the booking or agency, `agency_verification.status = APPROVED`, agency's `payout_account_reference` is verified, `completed_at + settlement_delay_days <= now()` where `settlement_delay_days` is read from `platform_settings` (configurable, target §5 requirement — not hardcoded 14 anywhere in application logic).

---

## 4. State machines (target §12 — four independent, explicit transition graphs)

Designed as literal transition tables Phase 2/10 will encode as CHECK constraints plus a small `assert_valid_transition()` trigger function per state column (rejecting any UPDATE that isn't in the allowed-transitions table) — not just an unconstrained enum.

**Booking status:**
```
DRAFT → PENDING_PAYMENT → PAYMENT_PROCESSING → CONFIRMED → IN_PROGRESS → COMPLETED
                                             ↘ CANCEL_REQUESTED → CANCELLED
DRAFT/PENDING_PAYMENT/PAYMENT_PROCESSING → EXPIRED (quote/hold expired, no payment)
CONFIRMED → DISPUTED (admin-initiated, e.g. chargeback on the reservation fee)
CONFIRMED → NO_SHOW (post-departure-date, agency-reported)
```

**Payment status** (per obligation — a booking's `payments` rows each carry their own):
```
UNPAID → PENDING → PROCESSING → PAID
                              ↘ FAILED
                              ↘ EXPIRED
PAID → PARTIALLY_REFUNDED → REFUNDED
PAID → DISPUTED
```

**Settlement status** (agency-balance obligation only, meaningful only when `balance_method = INTO_NEPAL_PLATFORM`):
```
NOT_APPLICABLE (balance_method = DIRECT_TO_AGENCY)
NOT_ELIGIBLE → PENDING → ON_HOLD (dispute/refund/admin hold raised) → PENDING (cleared)
PENDING → ELIGIBLE (all §3.8 conditions met) → PROCESSING → PAID
                                             ↘ FAILED → ELIGIBLE (retry)
PAID → REVERSED (rare — e.g. a post-payout dispute upheld)
```

**Refund status:**
```
NONE → REQUESTED → PROCESSING → REFUNDED
                              ↘ PARTIALLY_REFUNDED
                              ↘ FAILED → REQUESTED (retry)
REFUNDED/PARTIALLY_REFUNDED → REVERSED (rare — reversed refund, e.g. chargeback dispute won)
```

**Why enforce this at the database layer and not just application code:** the current system's two-field, unconstrained-transition design (Phase 0 §3) is exactly how `AUDIT_REPORT.md` PAY-01 was able to leave a booking silently stuck in a state (`pending_payment`/`unpaid`) indistinguishable from "never attempted," and how nothing prevents e.g. a `completed` booking being pushed back to `pending_payment` by a bug elsewhere. A rejected-invalid-transition trigger turns "impossible state" bugs into loud, immediate errors instead of silent data corruption discovered weeks later.

---

## 5. Payment provider abstraction (target §3, §15)

```ts
// Business logic (create-payment, verify-payment, refund flows) depends ONLY on
// this interface — never imports or references anything NIC-ASIA-specific.
interface PaymentProvider {
  createPayment(input: {
    paymentId: string;          // our internal payments.id
    amount: number;             // minor units (see §6 below) — never a float dollar amount
    currency: string;
    idempotencyKey: string;
    returnUrl: string;
    metadata: Record<string, string>;  // our internal references only (booking_ref,
                                        // payment_id) — never card/PII data
  }): Promise<{ providerReference: string; redirectUrl?: string; clientPayload?: unknown }>;

  verifyPayment(input: { providerReference: string }): Promise<{
    status: "succeeded" | "pending" | "failed";
    amount: number;
    currency: string;
    providerTransactionId: string;
  }>;

  handleCallback(rawRequest: { headers: Headers; body: string }): Promise<{
    verified: boolean;           // signature/authenticity check result
    eventId: string;             // provider's own event/transaction id — becomes
                                  // payment_events.provider_event_id (UNIQUE, our
                                  // idempotency backbone)
    eventType: string;
    providerReference: string;
    amount: number;
    currency: string;
    status: "succeeded" | "pending" | "failed";
  }>;

  refundPayment(input: {
    providerReference: string; amount: number; currency: string; idempotencyKey: string;
  }): Promise<{ providerRefundId: string; status: "processing" | "succeeded" | "failed" }>;

  getPaymentStatus(input: { providerReference: string }): Promise<{ status: string }>;
}

class PaymentService {
  constructor(private provider: PaymentProvider) {}
  // orchestrates: quote validation → inventory hold check → provider.createPayment()
  // → payments/payment_attempts rows → returns what the frontend needs to redirect/render.
  // This class contains ZERO NIC-ASIA-specific code — swapping providers means
  // writing a new class implementing PaymentProvider, not touching PaymentService,
  // create-payment, verify-payment, or any booking/ledger logic. This is the
  // concrete mechanism satisfying target §3's "architecture must allow
  // provider-specific implementation without changing booking/business logic."
}

class NICAsiaProvider implements PaymentProvider {
  // STUBBED in this phase — every method throws NotImplementedError with a message
  // pointing back to Phase 0 open question #1 (no docs available yet). This lets
  // Phases 12-13 (reservation payment, verified callback/confirmation) be built
  // and tested against a *fake* provider implementing the same interface (useful
  // for Phase 31 automated tests regardless of when real NIC ASIA docs arrive),
  // with the real implementation slotted in later without touching anything
  // upstream of it.
}
```

**Field-level honesty:** per target §3/§15/§66's explicit "do not invent NIC ASIA API fields" rule, `providerReference`/`providerTransactionId`/callback signature verification in the stub are placeholder shapes only, clearly commented as such, not presented as real. When real docs arrive, `NICAsiaProvider`'s internals get filled in; the interface above is intentionally generic enough that it shouldn't need to change shape to accommodate a real provider (redirect-based hosted checkout and most South Asian payment gateways — eSewa, Khalti included, per target §3's explicit future-provider list — fit this same create/verify/callback/refund/status shape).

---

## 6. Money representation (target §8)

**Decision: NUMERIC(12,2) in the database (not integer minor units), with strict discipline that no monetary value is ever computed or compared in JavaScript floating point.** Rationale: Postgres `NUMERIC` is exact-precision and this codebase's existing convention (`NUMERIC(10,2)` throughout the current schema) is already this approach and works correctly at the database layer — the actual bug class the current system exhibits (Phase 0 SCHEMA-01, and generally) isn't float-precision-related, it's *generated-column-misuse* and *silent-error-swallowing* related. Re-litigating decimal-vs-integer-minor-units wouldn't fix any of the actual identified problems and would add conversion-boundary complexity (every display, every API payload) for no corresponding safety gain given Postgres NUMERIC is already exact. Every monetary table carries an explicit `currency CHAR(3)` (ISO 4217) column — never a global `assume USD` — matching target §8's explicit NPR-first requirement. All arithmetic (fee calculation, refund tiering, ledger summation) happens in SQL/`NUMERIC` server-side, never client-side, and never in a JS function operating on values that passed through JSON (where precision can already be lost before your own code even runs) — this is enforced by the "server calculates authoritative price" rule already, not a separate mechanism.

---

## 7. Role/permission model extension (target §28)

Extends, doesn't replace, the existing (correct) `app_metadata.role` pattern from Phase 0 §5:

```
Platform-wide role (app_metadata.role, unchanged mechanism):
  TRAVELER | AGENCY | ADMIN | SUPER_ADMIN | SUPPORT | FINANCE

Agency-scoped role (NEW — agency_users.role, only meaningful when platform role = AGENCY):
  OWNER | MANAGER | STAFF

Authorization checks now have two dimensions instead of one:
  1. Platform role (unchanged: app_metadata, RLS/edge-function-checked)
  2. Agency membership + agency-scoped role (NEW: agency_users row must exist
     linking auth.uid() to the agency_id being accessed, for any agency-scoped
     table's RLS policy — not just "role = agency" the way it is today)

Example RLS shift:
  Today:      USING (auth.uid() = agency_id)                     -- 1:1 user:agency
  Target:     USING (EXISTS (SELECT 1 FROM agency_users au
                              WHERE au.agency_id = <table>.agency_id
                                AND au.user_id = auth.uid()
                                AND au.removed_at IS NULL))       -- N:1 users:agency
```

`FINANCE`/`SUPPORT` split (target §61): `FINANCE` gets write access to settlement/payout/ledger-adjustment actions; `SUPPORT` gets read access to bookings/messages for customer-issue resolution but no financial write access; `ADMIN`/`SUPER_ADMIN` retain broader access. Exact permission matrix is a Phase 3 deliverable, not fully specified here — Phase 1 establishes that the dimension exists and where it plugs into RLS.

---

## 8. Domain events and notifications (target §26, §38)

```
domain_events   -- append-only internal event log, the backbone of "confirm
                   transactionally, notify asynchronously" (target §38)
  id, event_type (QUOTE_CREATED | PAYMENT_SUCCEEDED | BOOKING_CONFIRMED | ... —
     the full ~20-event list from target §26), aggregate_type, aggregate_id
     (e.g. 'booking', booking_id), payload (JSONB), created_at, processed_at

notifications   -- one row per (event, recipient, channel) actually sent/queued
  id, domain_event_id → domain_events, recipient_id → auth.users, channel
     (IN_APP | EMAIL | SMS — SMS deferred per target §26), status (QUEUED | SENT |
     FAILED), idempotency_key (UNIQUE — target §26 "do not send duplicate booking
     confirmation emails when a webhook is replayed" is enforced structurally here:
     the key is derived from (domain_event_id, recipient_id, channel), so a
     replayed event that's already been processed into a domain_events row with
     the same identity can't produce a second notifications row)
```

**Concrete mechanism for target §38's transactional-confirm / async-notify split:** the booking-confirmation transaction (§9 below) ends with a single `INSERT INTO domain_events (event_type='BOOKING_CONFIRMED', ...)` as its last statement, inside the same transaction as the booking/inventory/ledger writes — so the event's existence is exactly as durable as the confirmation itself. A separate, transaction-independent worker/trigger picks up unprocessed `domain_events` rows and fans them out to `notifications` (email, in-app) with its own retry logic. If email sending fails, the booking is still confirmed (already committed) and the notification retries independently — directly satisfying "If notification fails: booking must remain confirmed. Notification retries separately."

---

## 9. The booking-confirmation transaction (target §38, concrete design)

```
BEGIN;
  -- 1. Re-verify payment (already done by verify-payment before this transaction
  --    starts, per target §13 step 12-17 — this transaction assumes payment is
  --    already provider-confirmed and is now committing the consequences)
  -- 2. Re-check quote validity (not expired, not already consumed)
  -- 3. inventory_reservations: HELD → CONFIRMED (capacity_held → capacity_confirmed)
  --    (idempotent: if already CONFIRMED, no-op — handles webhook replay safely)
  -- 4. bookings: PENDING_PAYMENT → CONFIRMED, payment_status → PAID
  -- 5. financial_ledger: INSERT INTO_NEPAL_REVENUE entry for the platform fee
  -- 6. booking_status_history: INSERT BOOKING_CONFIRMED row
  -- 7. domain_events: INSERT BOOKING_CONFIRMED event
COMMIT;
-- (async, outside this transaction, triggered by the domain_events row above:)
--   notifications fan-out → traveler confirmation email, agency notification email
```

This entire block lives in one Postgres function (`confirm_booking(booking_id, payment_event_id)`), callable only by the `verify-payment`/webhook-handling edge function (service-role), and — critically — is itself idempotent: calling it twice with the same `payment_event_id` (a webhook replay) is a guaranteed no-op on the second call, checked via `payment_events.processing_status` before any of steps 3–7 run. This directly fixes the exact failure mode of `AUDIT_REPORT.md` PAY-01 (an error partway through silently treated as success) by making the whole confirmation atomic and erroring loudly (transaction rollback) rather than partially applying.

---

## 10. What Phase 1 deliberately does not decide

- **Exact DDL** (column types, exact constraint syntax, exact index list) — Phase 2.
- **Exact RLS policy text** for every table above — Phase 3/29, though §7 establishes the agency_users-aware pattern every policy will follow.
- **Exact pricing-rule resolution algorithm** (base → seasonal → override precedence, rounding rules) — Phase 8.
- **Exact NIC ASIA field mapping** — blocked on Phase 0 open question #1.
- **Whether `agencies`/`agency_verification` are one table or two** (§3.1 leaves this open) — a Phase 2 implementation-detail decision once the exact query patterns needed by Phase 4 (agency onboarding UI) are clearer; functionally equivalent either way as long as `agency_status_history` is append-only and separate.
- **Whether `booking_guests`/`booking_items` are built now or deferred** — blocked on Phase 0 open question #4 (product scope confirmation).

---

## Recommendation for Phase 2

Phase 2 ("Database redesign and migrations") should: (a) adopt the Supabase CLI `supabase/migrations/` structure as its first act (Phase 0 §7 recommendation — stop adding to the 35-loose-file problem), (b) implement the entity model above as ordered, idempotent migrations grouped roughly by the bounded contexts in §1 (Identity/Agency Management first, since Catalog/Inventory/Quoting/Booking/Payments/Ledger/Settlement all depend on it), (c) since there's no live data to preserve, this can be a clean-slate schema rather than an ALTER-heavy migration of the existing tables — though the *existing* tables should still be explicitly `DROP`ped in the new migration set (not left dangling) so the final schema has no orphaned legacy objects, per target §47's "remove legacy architecture" instruction.

Waiting for your go-ahead before starting Phase 2.
