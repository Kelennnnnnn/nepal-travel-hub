# Hosted Auth Checklist (manual, Supabase Dashboard)

None of these have a `supabase/config.toml` or CLI equivalent that
reaches a **hosted** Supabase project — `config.toml` only governs the
local dev stack. Go through this list by hand, once, against the real
project, before go-live. Where a setting does have a local mirror, it's
noted so you know local dev is already exercising the same behavior.

**Dashboard → Authentication → Policies / Settings** (exact tab names vary slightly by Supabase dashboard version).

- [ ] **Minimum password length: 10.**
  Dashboard → Authentication → Policies → Password Requirements. Local mirror: `supabase/config.toml`'s `[auth]` → `minimum_password_length = 10`.
- [ ] **Require lowercase, uppercase, and digit characters.**
  Same screen — select "Lowercase, uppercase letters, digits". Local mirror: `password_requirements = "lower_upper_letters_digits"`.
- [ ] **Email confirmations: ON.**
  Dashboard → Authentication → Sign In / Providers → Email → "Confirm email". Local mirror: `[auth.email]` → `enable_confirmations = true`.
- [ ] **Secure password change: ON.**
  Dashboard → Authentication → Policies → "Secure password change" (requires a recent login/reauthentication before a password change is accepted). Local mirror: `[auth.email]` → `secure_password_change = true`.
- [ ] **Leaked password protection: ON.**
  Dashboard → Authentication → Policies → "Leaked password protection" (checks against HaveIBeenPwned on signup/password change). **No local/config.toml equivalent at all** — this is a hosted-only, paid-plan feature; local dev cannot exercise it.
- [ ] **Turnstile CAPTCHA on sign-up AND sign-in.**
  Dashboard → Authentication → Sign In / Providers → Bot and Abuse Protection → enable, provider "Turnstile", using the SAME site/secret key pair documented in [README_DEPLOY.md](../README_DEPLOY.md) §2d/4c (`TURNSTILE_SECRET_KEY` — the contact form's Turnstile widget is a *separate* keypair from this one; don't reuse a key meant for the contact form here, or vice versa, provision two distinct Turnstile widgets). Deliberately left disabled in `supabase/config.toml` locally (`[auth.captcha]` stays commented out) — turning this on for local dev would force every developer to solve a real Turnstile challenge just to create a test account, which isn't worth the friction for a setting that otherwise mirrors cleanly.
- [ ] **JWT expiry: 3600 seconds (1 hour).**
  Dashboard → Authentication → Sessions → "Access token (JWT) expiry limit". Already matches locally — `supabase/config.toml`'s `[auth]` → `jwt_expiry = 3600` was already set correctly; nothing to change there, just confirm the hosted value matches.
- [ ] **Refresh token rotation: ON.**
  Dashboard → Authentication → Sessions → "Refresh token rotation". Already matches locally — `enable_refresh_token_rotation = true`; nothing to change there, just confirm the hosted value matches.
- [ ] **MFA (TOTP) enabled.**
  Dashboard → Authentication → Sign In / Providers → Multi-Factor Authentication → enable "Authenticator App (TOTP)". **Required**, not optional — `is_admin()`/`is_support_or_admin()`/`is_finance_or_admin()` (`supabase/migrations/20260916000001_extensions_and_helpers.sql`) unconditionally require `aal2` for every elevated platform role; if TOTP is disabled on the hosted project, no admin/support/finance account can ever satisfy that check and the entire admin portal becomes unreachable. Already matches locally — `[auth.mfa.totp]` → `enroll_enabled = true`, `verify_enabled = true`.
- [ ] **Site URL + redirect URLs scoped to the three real portals only.**
  Dashboard → Authentication → URL Configuration. Site URL: your primary production domain (e.g. `https://intonepal.com`). Redirect URLs: add exactly the www/partner/admin subdomains this project actually serves (e.g. `https://intonepal.com/**`, `https://partner.intonepal.com/**`, `https://admin.intonepal.com/**`) — no wildcards wider than that, no leftover staging/preview/localhost entries from earlier testing. A redirect URL this platform doesn't actually serve is a standing open redirect risk for every email-confirmation/magic-link/OAuth flow.
- [ ] **Custom SMTP (Resend) configured.**
  Dashboard → Authentication → Sign In / Providers → SMTP Settings → enable custom SMTP, using Resend's SMTP credentials (same Resend account as `RESEND_API_KEY` in README_DEPLOY.md, or a dedicated one — either works, Resend supports both API and SMTP sending on the same account). Without this, GoTrue's own auth emails (confirmation, password reset, magic link, email change) send from Supabase's shared rate-limited default sender, which is fine for local dev but not acceptable for production deliverability/branding. This is separate from `RESEND_API_KEY` — that one is for the *application's* transactional emails (welcome, agency lifecycle, contact form) sent via `supabase/functions/_shared/email.ts`; this SMTP config is specifically for GoTrue's own built-in auth emails.
- [ ] **Auth rate limits reviewed.**
  Dashboard → Authentication → Rate Limits. Local defaults (`[auth.rate_limit]` in `supabase/config.toml`) are tuned for local development (e.g. `email_sent = 2`/hour), not production traffic — review each value against expected real signup/sign-in volume before launch; too low and real users get locked out, too high and the rate limit stops being a meaningful abuse defense.
