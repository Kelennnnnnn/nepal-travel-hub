# NepalTrails — Travel Marketplace

A full-stack travel marketplace connecting travelers with verified local agencies in Nepal. Built with React, TypeScript, and Supabase.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| State | Zustand |
| Backend | Supabase (Postgres + Auth + Realtime + Edge Functions) |
| Payments | TODO — moving to an NPR-only reservation-fee model (Stripe removed) |
| Package manager | npm |

---

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org) (npm ships with it)
- **Supabase CLI** — `brew install supabase/tap/supabase` or see [CLI docs](https://supabase.com/docs/guides/cli)
- A **Supabase** account — [supabase.com](https://supabase.com)

---

## 1. Clone and Install

```bash
git clone https://github.com/Kelennnnnnn/nepal-travel-hub.git
cd nepal-travel-hub
npm install
```

> **Note:** this project uses npm — `package-lock.json` is the committed lockfile. `bun.lock`/`bun.lockb` existed briefly from an earlier experiment and have been removed; don't regenerate them.

---

## 2. Environment Variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in your values:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_TURNSTILE_SITE_KEY=your_turnstile_site_key
VITE_SENTRY_DSN=
VITE_APP_ENV=development
```

Both Supabase keys are in **Supabase Dashboard → Project Settings → API**. `VITE_TURNSTILE_SITE_KEY` is the public site key for the contact form's bot-protection widget — see **Supabase → Project Settings → API** for the Supabase keys, and **Cloudflare Dashboard → Turnstile** for the Turnstile key pair (its matching secret key is an Edge Functions secret, set in step 5b, never a client-side variable).

`VITE_SENTRY_DSN` and `VITE_APP_ENV` are for frontend error tracking (`src/lib/sentry.ts`) — leave `VITE_SENTRY_DSN` empty for local development; Sentry initializes only when it's set, and the app runs identically either way. In production, set it to your Sentry project's DSN (**Sentry → Project Settings → Client Keys**) and set `VITE_APP_ENV=production` so events are tagged correctly. Events are also tagged `portal` (`www`/`partner`/`admin`) based on the request's hostname subdomain.

> **Security:** Never put `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` or any client-side file. It is injected into Edge Functions as a Supabase secret only (see step 5).

---

## 3. Supabase Project Setup

### 3a. Create a project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. Copy the **Project URL** and **anon key** from **Settings → API** into `.env.local`.

### 3b. Run migrations

> **Note (2026-09):** this project is mid-redesign — see `PHASE_0_FORENSIC_AUDIT.md`
> and `PHASE_1_ARCHITECTURE.md` at the repo root for why, and `PHASE_2_DATABASE.md`
> for what changed here specifically. The old loose `supabase_*.sql` files and
> `MIGRATION_ORDER.md` are gone; `supabase/migrations/` is now the single
> authoritative, ordered migration sequence (target: one real migration history,
> not manually-pasted SQL Editor scripts).

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

This applies every file in `supabase/migrations/` in order. For local development,
`supabase start` followed by `supabase db reset` spins up the full schema (including
seeded `platform_settings` defaults) against a local Postgres instance — no manual
SQL Editor steps required either way.

### 3c. Verify Realtime

This redesign does not yet enable Supabase Realtime on any table (the old
schema's `ALTER PUBLICATION supabase_realtime ADD TABLE ...` statements were
tied to tables that no longer exist in this shape). Realtime for bookings/
messages/notifications is reintroduced deliberately in a later phase (see
target spec §56 — "Use realtime only where useful... apply authorization to
realtime channels"), not carried over by default.

---

## 4. Payments

TODO — the platform is moving to a new NPR-only model (a reservation fee
paid online to the platform, with the balance paid in cash to the agency or
online later). The previous Stripe-based checkout, webhook, and payout
integration has been removed; this section returns once the new payment
provider is chosen and integrated.

---

## 5. Edge Functions Deployment

### 5a. Log in and link your project

```bash
supabase login
supabase link --project-ref your-project-ref
```

### 5b. Set secrets

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Email — see supabase/functions/_shared/email.ts. EMAIL_MODE=mailtrap is
# refused at boot whenever ENVIRONMENT is "production".
supabase secrets set ENVIRONMENT=production
supabase secrets set EMAIL_MODE=resend
supabase secrets set FROM_EMAIL=noreply@intonepal.com
supabase secrets set SUPPORT_INBOX=support@intonepal.com

# Contact form bot protection (Cloudflare Turnstile secret key — pair it
# with VITE_TURNSTILE_SITE_KEY from step 2).
supabase secrets set TURNSTILE_SECRET_KEY=your_turnstile_secret_key

# Notification dispatch worker — the pg_cron job presents this header to
# authenticate its call to dispatch-notifications. Generate a long random
# value; it must also be stored in Supabase Vault (see 5d below).
supabase secrets set NOTIFICATIONS_CRON_SECRET=your_random_secret

# Inbox for the daily ops health alert (see 5e below) — only emailed on a
# day something actually failed, never a daily "all clear" ping.
supabase secrets set OPS_ALERT_EMAIL=ops@intonepal.com
```

The service role key is in **Supabase → Project Settings → API**.

### 5c. Deploy functions

```bash
supabase functions deploy admin-users
supabase functions deploy agency-application
supabase functions deploy review-agency-application
supabase functions deploy contact-form
supabase functions deploy send-welcome-email
supabase functions deploy agency-invitations
supabase functions deploy dispatch-notifications
```

### 5d. One-time: store the cron secret in Vault and schedule the dispatcher

`dispatch-notifications` runs every minute via `pg_cron` + `pg_net`, which
calls the deployed function over HTTP and must present the same secret set
in step 5b as a header. That secret is read from Supabase Vault at
schedule time (not baked into the migration as plaintext), so it needs to
be stored once, by hand, after secrets are set:

```sql
-- Run once in the Supabase SQL editor (or via `supabase db execute`),
-- against the SAME project the NOTIFICATIONS_CRON_SECRET secret was set on.
select vault.create_secret('your_random_secret', 'notifications_cron_secret');
```

Use the exact same value passed to `supabase secrets set NOTIFICATIONS_CRON_SECRET=...` above. The `dispatch-notifications-cron` pg_cron job (created by its migration) reads this Vault entry on every run — rotating the secret means updating both the Edge Functions secret and this Vault entry together.

### 5e. Production observability

- **Frontend error tracking** (`src/lib/sentry.ts`) needs no deploy step beyond setting `VITE_SENTRY_DSN`/`VITE_APP_ENV` (step 2) at build time — it's a static frontend env var, not an Edge Functions secret.
- **Cron health**: `public.cron_health()` (admin-only) backs the "System Health" card on `/admin` — nothing to configure, it reads `cron.job`/`cron.job_run_details` directly.
- **Daily ops alert**: `public.check_ops_daily_health()` runs once a day at 18:45 UTC (00:30 NPT) via `pg_cron`, and only queues an email (through the same `dispatch-notifications` worker as everything else) when a cron job failed in the last 24h or a notification permanently failed — a clean day sends nothing. Requires `OPS_ALERT_EMAIL` (above); no Vault step needed, this one doesn't call out over HTTP.

---

## 6. Local Development

```bash
npm run dev
```

The app runs at `http://localhost:8080`.

---

## 7. Portals and Routes

All three portals are served from the same build — access control is enforced via `user_metadata.role`.

| Portal | URL | Required role |
|---|---|---|
| Traveler (public) | `/` | None |
| Agency landing | `/agency` | None |
| Agency dashboard | `/agency/dashboard` | `agency` |
| Admin | `/admin` | `admin` |

### Creating an admin account

Register normally, then run this once in **Supabase SQL Editor**:

```sql
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'your-email@example.com';
```

Sign out and back in — the role is read from the JWT on sign-in.

---

## 8. Build for Production

```bash
npm run build
```

Output is in `dist/`. Deploy to Vercel, Netlify, or Cloudflare Pages.

Add a rewrite rule for SPA routing. For Vercel, create `vercel.json`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## 9. Project Structure

```
nepal-travel-hub/
├── src/
│   ├── components/
│   │   ├── admin/          # AdminLayout, sidebar nav
│   │   ├── agency/         # AgencyLayout
│   │   ├── auth/           # ProtectedRoute
│   │   ├── layout/         # Public Layout (Header + Footer)
│   │   ├── reviews/        # ReviewCard, ReviewSummary, WriteReviewDialog
│   │   └── ui/             # shadcn/ui primitives
│   ├── pages/
│   │   ├── admin/          # Dashboard, Agencies, Listings, Users
│   │   ├── agency/         # Dashboard, Listings, Bookings, Earnings, etc.
│   │   └── *.tsx           # Public pages
│   ├── stores/             # Zustand: auth, listings, bookings, agencies, reviews
│   └── lib/supabase.ts     # Supabase browser client
├── supabase/
│   ├── functions/           # Edge functions — being redesigned around NIC ASIA
│   │                          and the quote/booking engine (see PHASE_1_ARCHITECTURE.md);
│   │                          this listing is stale until that phase lands, so it's
│   │                          intentionally omitted here rather than left wrong.
│   ├── migrations/          # THE authoritative, ordered schema (supabase db push
│   │                          applies these in order) — see PHASE_2_DATABASE.md
│   └── schema.types.ts      # Generated TypeScript types for the new schema
```

---

## License

ISC
