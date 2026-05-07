# Nepal Travel Hub — Industry-Standard Marketplace Checklist

A critical gap analysis of this codebase against production travel marketplaces (Airbnb, Booking.com, Viator, GetYourGuide), with a prioritized checklist to reach production readiness with **no dummy data** and a **scalable foundation**.

---

## 0. Current State (TL;DR)

- **Stack**: Vite SPA (React 18 + TS) · Tailwind + shadcn/ui · Zustand · TanStack Query · Supabase (Postgres + Auth + Realtime + Edge Functions) · Stripe (USD only)
- **Portals**: Traveler / Agency / Admin served from one bundle
- **Schema present**: `agency_applications`, `listings`, `availability`, `bookings`, `reviews`, `payouts`, `agency_bank_details`, `conversations`, `messages`, `wishlists`, `audit_log`
- **Working primitives**: RLS on every table, computed commission columns, availability-decrement triggers, role-based routes, Stripe Connect onboarding, lazy-loaded routes, Zod form validation, admin MFA
- **Hard blockers**: SPA only (no SEO), USD hardcoded, no tax/refund/dispute/KYC tables, plaintext bank account numbers, no notifications, no tests, no CI, mock data files still in `src/data/`

---

## 1. Remove Dummy Data (do first)

The DB is wired for real data, but mock files are still importable and ship in the bundle.

- [ ] Delete `src/data/activities.ts` (`mockActivities` — 8 fake treks with Unsplash URLs)
- [ ] Delete `src/data/reviews.ts` (`mockReviews`, `getReviewsForActivity`)
- [ ] `grep -r "mockActivities\|mockReviews\|getReviewsForActivity" src/` and migrate every consumer to `usePublishedListings()` / `usePublishedReviews()` from `src/lib/queries.ts`
- [ ] Remove the Unsplash fallback at `src/pages/Activities.tsx:47` — show a real placeholder owned by us, or a CSS-only skeleton
- [ ] Replace the hardcoded `DEFAULT_IMAGE = "https://yatranepal.com/og-image.jpg"` in `src/components/SEO.tsx` with an env-driven URL
- [ ] Add an ESLint rule (`no-restricted-imports`) blocking `src/data/**` from production code so this never regresses

---

## 2. CRITICAL — Must ship before any public launch

### 2.1 Database / Money Integrity
- [ ] `transactions` ledger table — every charge / refund / payout / adjustment, append-only, FK to `bookings`, currency + amount_minor (integer cents)
- [ ] `refunds` table — `booking_id`, `amount_minor`, `reason`, `status`, `processor_refund_id`, `requested_by`, `approved_by`
- [ ] `disputes` table + `dispute_status` on `bookings` — chargebacks, evidence URLs, deadlines
- [ ] `taxes` table (country, region, rate, effective_from/to) and `tax_amount_minor` column on `bookings`
- [ ] `kyc_submissions` table — id_type, id_number_encrypted, doc URLs, verifier, verified_at, expires_at
- [ ] `currencies` + `currency_rates` tables; convert all money columns to `amount_minor BIGINT` + `currency CHAR(3)`
- [ ] **Encrypt** `agency_bank_details.account_number` — pgcrypto `pgp_sym_encrypt` with key from Vault, OR move to Stripe-only storage and drop the column
- [ ] Add `soft_deleted_at` to `listings`, `bookings`, `reviews`, `users` (commerce/audit retention vs. GDPR erasure)
- [ ] Replace JWT `user_metadata.role` reads in RLS with a server-managed `public.user_roles` table joined via `auth.uid()` — `user_metadata` is client-mutable until proven otherwise (see existing `supabase/fix_role_escalation.sql`)
- [ ] Wrap booking creation in a transaction with `SELECT … FOR UPDATE` on the `availability` row to eliminate the spots-remaining race; add `CHECK (spots_remaining >= 0)`
- [ ] Indexes for the queries you actually run: `(status, category, location)` on listings, `(traveler_id, status, trip_date DESC)` on bookings, GIN on `to_tsvector(title || description)` for FTS

### 2.2 Payments
- [ ] Multi-currency end-to-end (NPR primary, USD/EUR secondary). Stop hardcoding `currency: "usd"` in `supabase/functions/create-payment-intent/index.ts`
- [ ] Local rails: Khalti and eSewa Edge Functions (NPR) alongside Stripe (cards). Abstract behind a `PaymentProvider` interface so checkout doesn't care
- [ ] Webhook coverage in `stripe-webhook`: `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `transfer.failed`, `account.updated` — every one writes to `transactions`
- [ ] Idempotency keys on every Stripe call (currently absent → duplicate charges on retry)
- [ ] Refund flow: traveler request → agency/admin approve → `refunds.create` → webhook reconciles → email both parties
- [ ] Stripe Connect: stop hardcoding `country: "US"`; gate by agency country; verify `charges_enabled && payouts_enabled` before allowing `published` listings
- [ ] Scheduled payouts (pg_cron or Supabase Scheduled Function) — weekly batch, auto-retry failed transfers with backoff, alert admin after 3 failures
- [ ] Show full price breakdown at checkout: subtotal, taxes, platform fee, total — currency-aware
- [ ] Generate PDF invoices (server-side, store in private bucket, signed URL in confirmation email)

### 2.3 Auth & Account Security
- [ ] Phone verification (OTP via Twilio / MSG91) — required before booking > NPR threshold and before agency goes live
- [ ] Optional TOTP 2FA for travelers, mandatory for agencies (admins already have it)
- [ ] Brute-force protection: track failed logins in a `auth_attempts` table or use Supabase Auth hooks; lock after N attempts; CAPTCHA on signup/login (hCaptcha/Turnstile)
- [ ] Audit log for auth events (login, logout, password reset, role change, 2FA enable/disable)
- [ ] Session list / "log out other devices" UI

### 2.4 Notifications (currently zero)
- [ ] Transactional email provider (Resend / SES / Postmark) with versioned templates
- [ ] Triggers: signup confirm, booking confirmed, payment received, booking cancelled, refund issued, T-24h trip reminder, review request, new message, payout sent, KYC outcome
- [ ] In-app notifications table + bell UI with unread count, served via Supabase Realtime
- [ ] All sends go through one `notifications` worker so retries/backoff/dedup live in one place

### 2.5 SEO / Discoverability
- [ ] **Migrate to Next.js (App Router) or add a prerender layer** — an SPA without SSR is invisible to Google for marketplace listings. This is the single biggest commercial blocker
- [ ] Per-listing slug route `/activity/:slug-:id`, dynamic `<title>`, meta description, canonical, OG image (server-generated from listing photo)
- [ ] `schema.org` JSON-LD: `TouristTrip`, `Product`, `AggregateRating`, `BreadcrumbList`
- [ ] Dynamic `sitemap.xml` (listings + categories + locations) and `robots.txt`

### 2.6 Search
- [ ] Postgres full-text search (`tsvector` GIN index) on `listings.title || description || location` with `pg_trgm` for fuzzy/typo tolerance — usable for the first ~100k listings before needing Algolia/Meilisearch
- [ ] Add `lat NUMERIC`, `lng NUMERIC` to listings; `earthdistance` or PostGIS for "within X km of point"; show map in results
- [ ] Cursor-based pagination (current offset paging breaks past page ~50)

### 2.7 Compliance
- [ ] GDPR data export endpoint (user → ZIP of all their rows + storage objects)
- [ ] GDPR / Nepal DPA erasure flow — anonymize PII columns, keep the booking row (financial record retention)
- [ ] Cookie consent that actually gates analytics/marketing scripts (the existing `CookieConsent.tsx` doesn't appear to gate anything)
- [ ] Per-listing liability/age disclaimers; cancellation policy stored as structured data, not free text
- [ ] Separate Agency Terms of Service, signed at onboarding, version + accepted_at recorded

### 2.8 Observability
- [ ] Sentry (frontend + edge functions) — wire into `ErrorBoundary.tsx` (the TODO is right there)
- [ ] Structured JSON logs in every Edge Function with `request_id`, `user_id`, `booking_id` correlation
- [ ] Uptime + synthetic checks on `/`, `/activities`, `/booking/payment` flow
- [ ] Stripe webhook failure alerting (PagerDuty / Slack)

### 2.9 Quality Gates
- [ ] Vitest + React Testing Library for unit / component tests
- [ ] Playwright E2E covering: signup → search → book → pay → review, agency listing creation, admin moderation, cancellation+refund
- [ ] GitHub Actions: `lint → typecheck → test → build` blocking on PRs; preview deploy per PR; migration linter (e.g., `squawk`) on SQL changes

---

## 3. HIGH — Required for V1 launch quality

### Architecture
- [ ] Introduce a server boundary (Next.js Route Handlers or a thin tRPC layer) — components currently import `supabase` directly, which leaks schema and blocks future provider swaps
- [ ] Split builds per portal (traveler / agency / admin) — admin code should not ship to anonymous visitors
- [ ] OpenAPI (or tRPC introspection) doc generated in CI

### Listings
- [ ] Image pipeline: validate MIME + magic bytes + size on upload, strip EXIF, generate AVIF/WebP + `srcset` thumbnails (Supabase Image Transformations or `sharp` in an Edge Function)
- [ ] Bulk availability: month-grid UI + CSV import; `INSERT … ON CONFLICT` upserts
- [ ] Listing variants table (e.g., "single tent" vs "shared", "half-day" vs "full-day") with own price + capacity
- [ ] Cancellation policy enum on listing (flexible / moderate / strict / non-refundable) + automatic refund calculation at cancel time
- [ ] Highlights / amenities normalized into a join table (filterable)
- [ ] Listing draft preview, change history, scheduled publish
- [ ] Per-listing SEO fields (slug, meta title/description, custom OG image)

### Reviews
- [ ] Moderation queue (`status: pending|approved|rejected|flagged`) — auto-publish after spam/profanity check, hold the rest
- [ ] Agency public response field, edit window (e.g., 14 days), one edit only
- [ ] Photo uploads on reviews (same image pipeline as listings)
- [ ] Move helpful votes from `localStorage` to a `review_votes` table with `(review_id, user_id)` unique
- [ ] User-side report-abuse on reviews and listings

### Booking
- [ ] Pessimistic locking on availability (covered above)
- [ ] Instant-confirm vs request-to-book per listing
- [ ] Booking modification (date/guest count) within policy window with delta charge/refund
- [ ] Group bookings (multiple travelers per booking) with per-traveler details
- [ ] Waitlist when full; auto-offer on cancellation

### Messaging
- [ ] Email/push fanout on new message (debounced; don't email if user is online)
- [ ] Attachments via Storage with virus scan
- [ ] Server-side rate limit (e.g., 30 messages / 5 min) and profanity/spam filter
- [ ] Search across own conversations

### Admin
- [ ] Dispute resolution workspace (booking + transactions + messages + uploaded evidence side-by-side)
- [ ] KYC review UI: doc viewer, approve / reject with reason, expiry tracking
- [ ] Financial reports: GMV, take-rate, refunds, outstanding payouts — exportable CSV
- [ ] Bulk approve / reject / feature listings; saved filters; full-text search on every list page

### Performance / Scale
- [ ] CDN in front of Storage (Cloudflare / bunny.net) — current direct Supabase URLs will not survive a marketing push
- [ ] Cache + revalidate listing pages (ISR if Next.js, or stale-while-revalidate on a Cloudflare Worker)
- [ ] Rate limiting on Edge Functions (`@upstash/ratelimit` or pg-based) — per-IP for anon, per-user for auth
- [ ] React Query staleTime/keepPreviousData tuned per query (catalog vs. dashboard differ)
- [ ] Lighthouse CI budget in PRs

### Internationalization
- [ ] `react-i18next` with `en` and `ne` (Nepali) locales; route-prefixed (`/ne/...`)
- [ ] All money rendered through one helper that takes `(amount_minor, currency, locale)` — never `${price}` in JSX
- [ ] Dates via `date-fns` with locale; store all timestamps `TIMESTAMPTZ` (already the case), render in user TZ

### Accessibility
- [ ] WCAG 2.1 AA pass — `axe` in CI, manual screen-reader sweep of booking + signup flows
- [ ] Visible focus ring everywhere, focus trap in dialogs (shadcn defaults are close, verify), skip-to-content link
- [ ] Real `alt` text on listing images (use listing title as fallback, not empty string)

### Security hardening
- [ ] Server-side validation in every Edge Function (re-run the same Zod schema; never trust the client)
- [ ] Sanitize stored HTML/markdown (DOMPurify on render, or strip on write) for `listings.description`, `itinerary`, `reviews.comment`
- [ ] CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy via hosting platform headers
- [ ] Signed, short-lived URLs for private storage objects; never expose bucket-public buckets for KYC
- [ ] Storage upload policy: validate `(content_type, size)` server-side, restrict by extension, randomize filenames

---

## 4. MEDIUM — V1.1 / scale enablers

- [ ] Surge / seasonal pricing rules table
- [ ] Category hierarchy + tags (replaces the flat enum)
- [ ] Saved searches + price-drop email alerts
- [ ] SMS notifications (Twilio) for trip-day reminders
- [ ] Web Push (VAPID) notifications
- [ ] Recommendations ("travelers also booked") — start with simple co-occurrence in SQL
- [ ] Admin export (CSV/XLSX) for any list view
- [ ] Manual/offline payment entry for bank transfers
- [ ] Search-term analytics + zero-result reporting
- [ ] PWA manifest + service worker (offline shell, "Add to home screen")

---

## 5. LOW — V2+

- [ ] Apple Pay / Google Pay
- [ ] Video on listings
- [ ] Native iOS/Android (React Native / Expo, share types via shared package)
- [ ] ML recommendations / personalized ranking
- [ ] Loyalty / referral program

---

## 6. Suggested Sequencing (≈ 16–20 weeks)

| Phase | Weeks | Theme |
|-------|-------|-------|
| 0 | 0–1 | Remove mock data · CI pipeline · Sentry · server-side Zod |
| 1 | 1–4 | Money correctness: multi-currency, transactions/refunds/disputes/taxes tables, idempotency, encrypted bank data, server-managed roles |
| 2 | 3–6 | Notifications + email infra · phone verification · brute-force/CAPTCHA |
| 3 | 5–9 | Next.js migration · SSR · per-listing SEO · sitemap · FTS + geo |
| 4 | 8–12 | Local rails (Khalti/eSewa) · scheduled payouts · refund/dispute UI · KYC UI · cancellation policies |
| 5 | 11–14 | i18n (en/ne) · NPR everywhere · accessibility audit · CDN + image pipeline |
| 6 | 13–16 | Reviews moderation + photos · variants · waitlist · admin reporting |
| 7 | 15–20 | PWA · push/SMS · scale tests · security review · GDPR export/erasure |

---

## 7. Architectural Decisions to Lock Now

These are cheap to decide today and expensive to change later:

1. **SSR framework**: commit to Next.js App Router before adding more pages, or accept indefinite SEO loss
2. **Money representation**: integer minor units + ISO 4217 currency code on every row, today, before more payment code is written
3. **Roles source of truth**: `public.user_roles` table, not `auth.user_metadata`
4. **Money/auth/notifications must go through one boundary** (Edge Functions or Next.js route handlers) — banish direct `supabase` calls from React components for these domains
5. **One image pipeline** (Storage transformations or a worker) used by listings, reviews, KYC, profile — don't reinvent per-feature
6. **One notifications dispatcher** — every email/SMS/push goes through it; no ad-hoc `resend.send()` sprinkled in components
