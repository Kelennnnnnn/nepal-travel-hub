# NepalTrails — Travel Marketplace

A full-stack travel marketplace connecting travelers with verified local agencies in Nepal. Built with React, TypeScript, Supabase, and Stripe.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| State | Zustand |
| Backend | Supabase (Postgres + Auth + Realtime + Edge Functions) |
| Payments | Stripe |
| Package manager | Bun |

---

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Bun** — `curl -fsSL https://bun.sh/install | bash`
- **Supabase CLI** — `brew install supabase/tap/supabase` or see [CLI docs](https://supabase.com/docs/guides/cli)
- A **Supabase** account — [supabase.com](https://supabase.com)
- A **Stripe** account — [stripe.com](https://stripe.com)

---

## 1. Clone and Install

```bash
git clone https://github.com/Kelennnnnnn/nepal-travel-hub.git
cd nepal-travel-hub
bun install
```

---

## 2. Environment Variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in your values:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
```

Both Supabase keys are in **Supabase Dashboard → Project Settings → API**.
The Stripe publishable key is in **Stripe Dashboard → Developers → API Keys**.

> **Security:** Never put `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` or any client-side file. It is injected into Edge Functions as a Supabase secret only (see step 5).

---

## 3. Supabase Project Setup

### 3a. Create a project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. Copy the **Project URL** and **anon key** from **Settings → API** into `.env.local`.

### 3b. Run migrations in order

Open **Supabase Dashboard → SQL Editor** and run each file below in this exact order. Each migration depends on the previous one.

| # | File | What it creates |
|---|---|---|
| 1 | `supabase_migration.sql` | `agency_applications` table, `update_updated_at_column` helper, Realtime |
| 2 | `supabase_listings_migration.sql` | `listings` + `availability` tables, RLS policies, Realtime |
| 3 | `supabase_bookings_migration.sql` | `bookings` table, availability spot triggers, Realtime |
| 4 | `supabase_reviews_migration.sql` | `reviews` table, rating recalculation trigger |

Paste the contents of each file into the SQL Editor and click **Run** before moving to the next.

> For a detailed description of every table and policy each file creates, see [`MIGRATION_ORDER.md`](MIGRATION_ORDER.md).

### 3c. Verify Realtime

In **Supabase Dashboard → Database → Replication**, confirm that `agency_applications`, `listings`, and `bookings` are enabled. The migration files include `ALTER PUBLICATION` statements, but it's worth double-checking.

---

## 4. Stripe Setup

1. In **Stripe Dashboard → Developers → API Keys**, copy your **Publishable key** (`pk_test_...`).
2. Add it to `.env.local` as `VITE_STRIPE_PUBLISHABLE_KEY`.
3. Your **Secret key** (`sk_test_...`) is used only in the `create-payment-intent` Edge Function — add it as a Supabase secret in step 5.

### Stripe Webhook (production)

In **Stripe Dashboard → Developers → Webhooks**, add an endpoint:

```
https://your-project-ref.supabase.co/functions/v1/create-payment-intent
```

For local testing:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-to http://localhost:54321/functions/v1/create-payment-intent
```

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
supabase secrets set STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
```

Both keys are in their respective dashboards. The service role key is in **Supabase → Project Settings → API**.

### 5c. Deploy functions

```bash
supabase functions deploy upgrade-agency-role
supabase functions deploy create-payment-intent
supabase functions deploy admin-users
```

---

## 6. Local Development

```bash
bun run dev
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
bun run build
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
│   ├── functions/
│   │   ├── admin-users/            # List/suspend/change-role via service role
│   │   ├── create-payment-intent/  # Stripe payment intent creation
│   │   └── upgrade-agency-role/    # Promote user to agency role on approval
│   └── schema.sql                  # Reference schema (informational only)
├── supabase_migration.sql
├── supabase_listings_migration.sql
├── supabase_bookings_migration.sql
├── supabase_reviews_migration.sql
└── MIGRATION_ORDER.md
```

---

## License

ISC
