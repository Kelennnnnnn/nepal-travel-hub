# Into Nepal — Phase 6: Departures and Capacity Management

**Status: complete and validated end-to-end against the local Supabase stack**, including the one genuinely new write path this phase adds (`set_departure_capacity()`), both its authorization check and its "can't reduce below reserved" safety check, and a real anonymous-visitor read of a published listing's departures with live capacity. This phase closes the gap flagged at the end of Phase 5's report ("a listing can be published with zero departures/inventory... nothing prevents that") as far as making departures and capacity genuinely manageable and visible — it does not build the booking/reservation flow itself, which remains later phases' job (see scope notes below).

---

## Why this phase exists, and its scope boundary

Phase 2 built `departures`, `inventory`, `blackout_dates`, and `seasonal_pricing` as tables, and `inventory`'s three reservation-time functions (`hold_inventory`/`confirm_reservation`/`release_reservation`), but nothing in Phase 2 gave agency staff any way to actually **create bookable capacity** — `inventory` has no INSERT/UPDATE grant for staff at all (deliberately: "every mutation goes through the SECURITY DEFINER functions... never directly via `supabase.from('inventory').update()`" — migration 5's own comment). That's correct for the reservation functions, but nothing filled the gap for the one legitimate non-reservation write an agency needs: setting a new departure's initial capacity. This phase's primary job is closing that gap, then building the UI and public-visibility surface around it.

**Deliberately out of scope**, per the same audit-doc phase assignments referenced in the Phase 5 report: the actual booking/reservation flow (`hold_inventory` called from a real checkout), the quote engine (`booking_quotes`), and price-resolution precedence (base → seasonal → override, when ranges overlap) — all explicitly Phase 8/9 territory. A traveler can now see real departures and real remaining capacity on a listing page, and the "Book Now" button is now wired to pass a real departure date, but the button itself still calls the old `create-payment-intent` function (Stripe-based, already flagged broken in Phase 3's report) — untouched, since fixing it requires the quote/payment layer this phase doesn't own.

---

## What changed

**Database:**
- `supabase/migrations/20260917000003_departure_capacity.sql` (**new**) — `set_departure_capacity(p_departure_id, p_capacity_total)`, `SECURITY DEFINER`. Verifies the caller has manager-level `has_agency_access()` on the departure's agency, rejects a negative capacity, and gives a clear `CAPACITY_BELOW_RESERVED` error (rather than a raw constraint-violation message) if the new total would drop below what's already held+confirmed. Lazily creates the `inventory` row on first call (`ON CONFLICT (departure_id) DO UPDATE`).

**New store:**
- `src/stores/departuresStore.ts` (**new**) — `Departure`/`Inventory`/`SeasonalPricing`/`BlackoutDate` types and CRUD actions. Kept separate from `listingsStore.ts` (a different concern, matching the existing separation between `agencyStore`/`listingsStore`). Exports `availableCapacity()` (the same `capacity_total - capacity_held - capacity_confirmed` formula as the DB's own `capacity_available()` function, computed client-side from the row PostgREST already returns rather than a second round-trip).

**Agency UI — full rewrite, not a rewire:**
- `src/pages/agency/AgencyAvailability.tsx` — the old 743-line calendar (one grid cell = one flat `availability` row with `spots_total`/`spots_remaining`/`price_override`/`blocked` all on it) does not map onto the new, normalized three-table split (`departures` = the "when", `inventory` = the "how many", `seasonal_pricing`/`blackout_dates` = separate concerns). Forcing the old per-cell bulk-edit interaction onto three normalized tables would have meant either a fragile client-side fan-out (the old `BulkRangeDialog`/`SeasonalPricingDialog` pattern, which wrote one denormalized row per date) or a lot of new complexity for low real value at this stage. Rebuilt instead as a simpler, list-based manager: a **Departures** table (date, capacity total/held/confirmed, available, status, edit-capacity/close/reopen/cancel/delete actions), a **Blackout Dates** section (add/remove), and a **Seasonal Pricing** section (add/remove one `season_name`/date-range/price row at a time, with the old quick-fill season templates kept as presets). `src/pages/agency/availability/BulkRangeDialog.tsx` and `SeasonalPricingDialog.tsx` are deleted — their per-date fan-out logic has no equivalent in the new model, and nothing else referenced them.

**Traveler-facing:**
- `src/pages/ActivityDetail.tsx` — the departure-date field was a free `<input type="date">` with no connection to real data at all (a traveler could "select" any date, including ones with zero departures or zero capacity). Replaced with a `<Select>` populated from the listing's real, future, `scheduled` departures with capacity remaining (`departures_public_select`/`inventory_public_select`, both already public-readable for published listings — no new RLS needed here). Each option shows the real date and real "N spots left". Picking a departure now clamps `participants` to that departure's actual availability, and the "Book Now" button is disabled outright when a listing has no upcoming departures at all — rather than letting a traveler proceed through a booking flow for something that was never actually schedulable, which is exactly the kind of silent-fake-availability gap this phase exists to close.

---

## How this was verified

Typecheck and lint clean (project-wide; the only lint findings anywhere are pre-existing issues in files this phase never touched). Then full runtime testing against the local Supabase stack:

1. **`set_departure_capacity()`**: legitimate call by the owning agency's staff → `204`, `inventory` row created correctly (verified by reading it back directly, not just trusting the 204). Illegitimate call by an authenticated non-staff user → `403 INSUFFICIENT_PRIVILEGE`. Simulated a real hold via `hold_inventory()` directly in SQL (2 spots), then attempted to reduce `capacity_total` below that → `400 CAPACITY_BELOW_RESERVED` with the exact reserved count named in the message; reducing to a still-valid value → `204`. All three outcomes read back and confirmed correct, not assumed from the HTTP status alone.
2. **Public visibility**: fetched a published listing's departures with embedded `inventory` as `anon` — succeeded and returned live `capacity_held`/`capacity_total` correctly, confirming `departures_public_select`/`inventory_public_select` (both direct, single-table policies — not the cross-table-dependency pattern that caused Phase 4 and Phase 5's bugs) work as designed for the exact query shape `ActivityDetail.tsx` now uses.
3. **`blackout_dates`/`seasonal_pricing` CRUD**: both inserted successfully by the owning agency's staff via direct PostgREST calls, matching what the rewritten `AgencyAvailability.tsx` does.
4. Test fixtures for this phase required first walking a listing through the full Phase 5 moderation lifecycle (draft → pending_review → approved-as-admin → published) to get a real published listing — which incidentally re-exercised Phase 5's guard trigger again on a fresh reset and confirmed it still rejects a direct-to-published insert even for this phase's own fixture setup (had to route around it correctly, the same way a real agency would).

---

## Direct fixes to prior audit findings / prior-phase risks

| Finding | Resolution |
|---|---|
| Phase 5 report's own flagged risk: "a listing can be published with zero departures/inventory... Phase 7 needs to decide whether that's acceptable" | Decided: publishing without departures remains allowed (a listing can exist before it has a schedule), but the traveler-facing page now makes the *consequence* honest — no fake date picker, no way to proceed to booking without a real, available departure. |
| No write path existed for `inventory.capacity_total` at all | Closed via `set_departure_capacity()`, following the established SECURITY DEFINER pattern rather than opening a raw client grant on a table Phase 2 deliberately locked down. |

---

## What Phase 6 deliberately did not do

- **Did not build the reservation/checkout flow.** `handleBooking()` in `ActivityDetail.tsx` still calls `create-payment-intent`, the old Stripe-based edge function — untouched. Selecting a real departure now feeds a real date into that broken call, but the call itself is Phase 9–11 territory (quote engine, then payment).
- **Did not implement price-resolution precedence.** `seasonal_pricing` rows can now be created and read, but nothing computes "which price applies to departure X" when a season overlaps or when a `price_overrides` row also exists for the same departure — that algorithm is explicitly Phase 8's job (see Phase 2's and Phase 1's own comments on this). `AgencyAvailability.tsx`'s seasonal-pricing card says as much directly to the agency user, rather than silently implying the number shown is authoritative.
- **Did not build anything for `price_overrides`.** It's a real table from Phase 2 with a working RLS policy, but nothing in this phase's UI writes to it — a per-departure price override can be set directly via the table today, but there's no agency-facing control for it yet. Left for whichever phase builds the pricing UI properly (Phase 8-adjacent).
- **Did not add capacity/departure visibility to the admin side.** `inventory_admin_all`/`departures_admin_all` already grant full admin access at the RLS layer, but no admin UI surfaces it — not a moderation concern, so not built now.
- **Did not auto-release inventory when a departure is cancelled.** Setting a departure's status to `cancelled` does not call `release_reservation()` for any held/confirmed reservations against it. With no real bookings existing yet in this phase, this is moot in practice — but it's a real gap a future phase (whichever one builds departure cancellation as a business flow, likely alongside booking cancellation) needs to close before it matters.
- **Did not touch `AgencyLayout`/`AgencySidebar`'s "Availability" nav label** — kept as-is even though the page now manages departures/capacity/blackout-dates/seasonal-pricing rather than a flat calendar, to avoid an unrelated navigation churn; the route (`/agency/availability`) is unchanged too.

## Risks / things to verify before the next phase

- **A departure's `cutoff_at` field exists in the schema but nothing in this phase's UI sets it.** `AgencyAvailability.tsx`'s "Add Departure" dialog only collects a date and initial capacity — cutoff enforcement (the "last moment a booking can be made" the schema comment describes) has no control surface yet.
- **`ActivityDetail.tsx`'s departure list has no pagination or cap.** A listing with dozens of scheduled departures would render a very long `<Select>` — fine for this phase's testing scale, worth revisiting once real agencies have real, larger schedules.
- **The "delete departure" action is only offered client-side when `capacity_held`/`capacity_confirmed` are both zero** — this is a UI-level courtesy, not a database constraint; nothing in the RLS/trigger layer actually prevents deleting a departure that has reservations against it (the FK from `inventory`/`inventory_reservations` to `departures` is `ON DELETE CASCADE`, so it would silently destroy reservation history too). Whichever future phase builds real booking cancellation should reconsider whether departures ought to be soft-deleted/archived instead of hard-deleted at all, rather than relying on the current client-side guard.

Waiting for your go-ahead before the next phase.
