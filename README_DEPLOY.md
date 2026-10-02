# Deploying Edge Functions

This is the edge-functions-specific deploy reference. For the full local
setup (frontend env vars, Supabase project setup, build), see
[README.md](README.md) — its §5 "Edge Functions Deployment" covers the
same ground in more narrative form; this file is the quick-reference
version plus the full per-function secrets table.

The previous version of this file documented deploying a function called
`upgrade-agency-role` — that function was deleted during the Phase 3
auth rewrite (role changes now go through `admin-users`, which is
audited and privilege-ceiling-checked) and no longer exists. There is
nothing to deploy under that name.

---

## 1. Log in and link your project

```bash
supabase login
supabase link --project-ref your-project-ref
```

## 2. Set secrets

### 2a. Auto-injected — never set these manually

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected into every deployed Edge Function automatically by Supabase.
Setting them yourself via `supabase secrets set` is unnecessary and not
shown below.

### 2b. Global secrets — read by every function (via `_shared/http.ts`)

| Secret | Required? | Default | Notes |
|---|---|---|---|
| `ENVIRONMENT` | **Yes, in production** | — | Set to `production`. Gates several fail-closed checks (CORS allowlist, `EMAIL_MODE=mailtrap` refusal, `FROM_EMAIL` requirement). |
| `ALLOWED_ORIGINS` | **Yes, in production** | none (fails closed) | Comma-separated list of exact origins allowed to call these functions, e.g. `https://intonepal.com,https://partner.intonepal.com,https://admin.intonepal.com`. With `ENVIRONMENT=production` and this unset, every function refuses every request (`500 Server misconfigured`) rather than silently allowing `*`. |

```bash
supabase secrets set ENVIRONMENT=production
supabase secrets set ALLOWED_ORIGINS=https://intonepal.com,https://partner.intonepal.com,https://admin.intonepal.com
```

### 2c. Email secrets — read by `contact-form`, `send-welcome-email`, `dispatch-notifications` (via `_shared/email.ts`, `_shared/emailTemplates.ts`, `_shared/branding.ts`)

| Secret | Required? | Default | Notes |
|---|---|---|---|
| `EMAIL_MODE` | No | `resend` | `resend` or `mailtrap`. `mailtrap` is refused at boot when `ENVIRONMENT=production` — a sandbox transport can never silently swallow real production email. |
| `RESEND_API_KEY` | **Yes, to actually send email** | — | From [resend.com](https://resend.com). Without it, `sendEmail()` logs an error and returns a soft failure — the calling function doesn't crash, but no email goes out. |
| `FROM_EMAIL` | **Yes, in production** | `onboarding@resend.dev` (non-production only) | Must be a domain you've verified with Resend. |
| `REPLY_TO_EMAIL` | No | `hello@intonepal.com` | |
| `PLATFORM_NAME` | No | `Into Nepal` | Shown in every email's header/footer and in subject lines. |
| `SITE_URL` | No | `https://intonepal.com` | Used to build links inside emails. |
| `SUPPORT_INBOX` | No | `support@intonepal.com` | Where `contact-form` submissions are delivered. |

```bash
supabase secrets set EMAIL_MODE=resend
supabase secrets set RESEND_API_KEY=your_resend_api_key
supabase secrets set FROM_EMAIL=noreply@intonepal.com
supabase secrets set SUPPORT_INBOX=support@intonepal.com
```

(`REPLY_TO_EMAIL`/`PLATFORM_NAME`/`SITE_URL` only need setting if you want something other than their `intonepal.com` defaults.)

### 2d. Per-function secrets

| Function | Secret | Required? | Notes |
|---|---|---|---|
| `contact-form` | `TURNSTILE_SECRET_KEY` | **Yes** | From Cloudflare Dashboard → Turnstile. Pairs with the frontend's `VITE_TURNSTILE_SITE_KEY`. Without it, every submission is rejected (verification always fails closed). |
| `dispatch-notifications` | `NOTIFICATIONS_CRON_SECRET` | **Yes** | Shared secret the pg_cron job presents as the `x-cron-secret` header. Generate a long random value. Must ALSO be stored in Supabase Vault (step 4 below) — the secret here and the Vault entry must match. |
| `dispatch-notifications` | `OPS_ALERT_EMAIL` | No (but see note) | Inbox for the daily ops health alert. If unset, `OPS_DAILY_HEALTH` events are logged and marked processed without sending anything — not a crash, just a silently-skipped alert. |

```bash
supabase secrets set TURNSTILE_SECRET_KEY=your_turnstile_secret_key
supabase secrets set NOTIFICATIONS_CRON_SECRET=your_random_secret
supabase secrets set OPS_ALERT_EMAIL=ops@intonepal.com
```

## 3. Deploy every function

There is no "deploy everything" flag that respects per-function config —
deploy each one explicitly:

```bash
supabase functions deploy admin-users
supabase functions deploy agency-application
supabase functions deploy agency-invitations
supabase functions deploy contact-form
supabase functions deploy delete-account
supabase functions deploy dispatch-notifications
supabase functions deploy record-audit-log
supabase functions deploy review-agency-application
supabase functions deploy send-welcome-email
```

(`supabase/functions/_shared/*` deploys automatically with every function that imports from it — it has no `index.ts` of its own and is never deployed directly.)

## 4. Manual one-time steps (hosted project)

These don't happen automatically from `supabase db push`/`deploy` — do each one once per project.

### 4a. Enable `pg_net` and confirm `pg_cron` on the hosted project

Local development enables both via `create extension if not exists ...`
inside the migrations themselves, which works because the local CLI runs
migrations with full superuser rights. On a **hosted** Supabase project,
`pg_cron` is usually already enabled by default, but `pg_net` sometimes
is not — check **Dashboard → Database → Extensions** and enable `pg_net`
there if it isn't already. If a migration's `create extension` statement
fails on push with a permissions error, this is almost always why —
enable it via the dashboard first, then re-run the migration.

### 4b. Store the notifications cron secret (and project URL) in Vault

`dispatch-notifications` runs every minute via `pg_cron` + `pg_net`
(`trigger_dispatch_notifications()`, `supabase/migrations/20260917000018_notification_dispatch.sql`),
which calls the deployed function over HTTP and must present the secret
set in step 2d as a header. Both the secret and the project URL it calls
are read from Supabase Vault at schedule time (never baked into the
migration as plaintext), so they need to be stored once, by hand, after
secrets are set:

```sql
-- Run once in the Supabase SQL editor (or via `supabase db execute`),
-- against the SAME project NOTIFICATIONS_CRON_SECRET was set on.
select vault.create_secret('your_random_secret', 'notifications_cron_secret');
select vault.create_secret('https://your-project-ref.supabase.co', 'project_url');
```

Use the exact same secret value passed to `supabase secrets set NOTIFICATIONS_CRON_SECRET=...` above. Rotating the secret means updating both the Edge Functions secret and this Vault entry together. The `ops-daily-health-check` cron job (`20260917000025_ops_daily_health_alert.sql`) does not need this — it calls a Postgres function directly, not an HTTP endpoint.

### 4c. Cloudflare Turnstile

1. Create a Turnstile widget at [Cloudflare Dashboard → Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile).
2. Add the production domain(s) (`intonepal.com`, `partner.intonepal.com`, etc.) to the widget's allowed hostnames.
3. Set the **site key** as the frontend's `VITE_TURNSTILE_SITE_KEY` build-time env var (see README.md §2).
4. Set the **secret key** as the `TURNSTILE_SECRET_KEY` Edge Functions secret (step 2d above).

---

## Related manual checklists

- [docs/HOSTED_AUTH_CHECKLIST.md](docs/HOSTED_AUTH_CHECKLIST.md) — Supabase Auth dashboard settings that have no migration/CLI equivalent (password policy, MFA, redirect URLs, custom SMTP, etc.) — go through this before going live, separately from the steps above.

## Running the regression suite locally

See `supabase/tests/security/` (pgTAP — table/function matrix + named exploit tests, run via `npm run test:db`) and `supabase/functions/tests/` (Deno — edge function tests, run via `npm run test:edge`). Both need a running local stack (`supabase start`).

`npm run test:edge` additionally needs `supabase/functions/.env` (gitignored, local-only — `supabase start`'s bundled edge-runtime reads secrets from this exact path, not `supabase/.env` or a CLI flag):

```
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
ENVIRONMENT=development
```

That key is [Cloudflare's own published, non-secret Turnstile testing key](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) — it always returns success regardless of the token sent, so `contact_form_test.ts` can exercise the "verification passed" path deterministically without a real challenge. `.github/workflows/ci.yml` writes the same file before `supabase start` in CI.
