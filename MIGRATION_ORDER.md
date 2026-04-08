# Migration Order

Run these SQL files in the Supabase SQL Editor **in the order listed below**.
Each file depends on the one before it — running them out of order will cause
foreign key or function reference errors.

---

## 1. `supabase_migration.sql`

**Run first. No dependencies.**

Creates:

- **`public.agency_applications`** — Stores travel agency partner applications.
  Fields: company info, owner contact, PAN/registration numbers, document URLs
  (`license_url`, `pan_url`, `insurance_url`), verification status
  (`pending` → `in_review` → `verified` | `rejected`), and `rejection_reason`.

- **`public.update_updated_at_column()`** — Reusable trigger function that
  automatically sets `updated_at = now()` on any row update. Used by subsequent
  tables.

- **RLS policies** — Agency owners can read/update their own application. Admins
  (identified by `user_metadata.role = 'admin'` in the JWT) can read and update
  all applications.

- **Realtime** — Enables `supabase_realtime` publication on `agency_applications`
  for live updates in the admin dashboard.

---

## 2. `supabase_listings_migration.sql`

**Depends on:** `supabase_migration.sql` (for `update_updated_at_column`)

Creates:

- **`public.listings`** — Activity listings created by agencies.
  Fields: `title`, `description`, `category`, `location`, `price`,
  `duration`, `max_participants`, `difficulty`, `images` (array),
  `includes`/`excludes` (arrays), `itinerary` (JSONB), `status`
  (`draft` → `pending_review` → `published` | `paused` | `rejected`),
  `featured`, `rating` (computed average), `review_count`.

- **`public.availability`** — Date-based availability slots for listings.
  Fields: `date`, `spots_total`, `spots_remaining`, `price_override`, `blocked`.
  Unique constraint on `(listing_id, date)`.

- **RLS policies** — Agencies can CRUD their own listings. Anyone can read
  `published` listings. Admins can read and update all listings.

- **Realtime** — Enables live updates on `listings`.

---

## 3. `supabase_bookings_migration.sql`

**Depends on:** `supabase_migration.sql`, `supabase_listings_migration.sql`

Creates:

- **`public.bookings`** — Traveler bookings against a listing and availability
  slot. Fields: auto-generated `booking_ref` (e.g. `BK-A1B2C3D4`), `listing_id`,
  `agency_id`, `traveler_id`, `availability_id`, `trip_date`, `guests`,
  `price_per_person`, `total_amount`, commission fields (rate, amount, net payout
  — computed columns), `status` (`pending_payment` | `confirmed` | `completed` |
  `cancelled`), `payment_status` (`unpaid` | `paid` | `refunded`),
  `payment_intent_id`, snapshot traveler contact fields, `special_requests`.

- **`on_booking_insert_decrement_spots()`** trigger — Decrements
  `availability.spots_remaining` when a non-cancelled booking is created.

- **`on_booking_cancel_restore_spots()`** trigger — Restores
  `availability.spots_remaining` when a booking is cancelled.

- **RLS policies** — Travelers can create and view their own bookings. Agencies
  can view and update bookings for their listings. Admins can view and update all.

- **Realtime** — Enables live updates on `bookings`.

---

## 4. `supabase_reviews_migration.sql`

**Depends on:** `supabase_listings_migration.sql`, `supabase_bookings_migration.sql`

Creates:

- **`public.reviews`** — Reviews submitted by travelers for completed bookings.
  Fields: `listing_id`, `agency_id`, `traveler_id`, `booking_id` (unique — one
  review per booking), `rating` (1–5 integer), `title`, `comment`,
  `traveler_name` (snapshot), `verified`, `helpful_count`.

- **`recalculate_listing_rating()`** trigger — Fires `AFTER INSERT OR UPDATE OR
  DELETE` on `reviews` and updates `listings.rating` (average) and
  `listings.review_count` (count) automatically.

- **RLS policies:**
  - Anyone can read reviews for published listings.
  - Travelers can insert a review only if they have a `completed` booking for
    that listing (enforced via `EXISTS` subquery).
  - Travelers can update only their own reviews.
  - Admins can manage all reviews.

---

## Quick Reference

```
supabase_migration.sql
  └── supabase_listings_migration.sql
        └── supabase_bookings_migration.sql
              └── supabase_reviews_migration.sql
```

If you need to reset and re-run, drop tables in reverse order:
`reviews` → `bookings` → `availability` → `listings` → `agency_applications`.
