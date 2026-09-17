# Into Nepal — Phase 3: Authentication, Roles and Authorization

**Status: complete and validated end-to-end against the local Supabase stack, including real TOTP enrollment/verification through the actual HTTP API.** This phase closes `AUDIT_REPORT.md` AUTH-01 (admin MFA was enforced only by a client-side redirect, never checked server-side) and implements the target §28 role model (traveler/agency/admin/super_admin/support/finance) on top of the Phase 2 schema. Unlike Phase 2, this phase touches real application code — both the edge-function layer and the React frontend — not just the database.

---

## What changed

**Database** (one surgical edit to an existing Phase 2 migration — safe since it was never applied anywhere live, and I reasoned through this explicitly before doing it):
- `supabase/migrations/20260916000001_extensions_and_helpers.sql` — `is_admin()`, `is_super_admin()`, `is_finance_or_admin()`, `is_support_or_admin()` now all require `is_authenticated_aal2()` in addition to the role check. This is the single point of change that makes MFA a real authorization boundary rather than a UI suggestion — every RLS policy across all 15 other Phase 2 migration files that calls these functions is fixed automatically, with no edits needed to those files (confirmed by grep: every call site is a genuine authorization decision, never a service-role bypass pattern that this change could have broken).
- `supabase/config.toml` — enabled `auth.mfa.totp` (enroll + verify), which ships disabled in a fresh `supabase init`. Left enabled permanently, not just for this test session, since the schema now requires MFA unconditionally for elevated roles.

**New edge-function shared helper:**
- `supabase/functions/_shared/auth.ts` — `verifyCaller()` (identity + role + AAL from a Bearer token) and `requirePlatformRole()` (the Deno-side equivalent of `is_admin()` etc., since edge functions run outside Postgres and can't call those SQL functions directly). Documented as a deliberate, hand-maintained duplication between the SQL and TypeScript implementations — there's no way to share one implementation across Postgres and Deno here.

**Rebuilt edge function:**
- `supabase/functions/admin-users/index.ts` — replaced the old 3-role implementation with the new 6-role set, requires AAL2 via `requirePlatformRole()`, adds a privilege ceiling (only `super_admin` can grant `admin`/`super_admin`; a plain admin cannot mint themselves or a collaborator a super_admin), blocks self role-changes and self-deletion, and now writes to `audit_logs` itself via `record_audit_log()` for every mutating action — server-attributed, not client-reported.

**New edge function:**
- `supabase/functions/record-audit-log/index.ts` — a small, admin-tier-only generic audit endpoint backing `src/lib/audit.ts` for the admin pages Phase 3 doesn't own directly (Listings/Reviews/Agencies/Settings moderation — Phases 4/5/24/43). Actor is always the verified caller's own id, never client-supplied.

**Frontend (13 files):**
- `src/stores/authStore.ts` — role renamed `user` → `traveler` (matching what Phase 2's DB already defaults to — this wasn't optional, the two had to agree), added `aal` and `hasVerifiedMfaFactor` state (refreshed on every auth event, including the `MFA_CHALLENGE_VERIFIED` event GoTrue fires the moment `mfa.verify()` succeeds), and added `agencyMemberships` (fetched from the new `agency_users` table) so the frontend can be multi-staff-agency-aware going forward.
- `src/lib/roleRedirect.ts` — `resolveAdminDestination()` → `resolveElevatedDestination()`, covering all four elevated roles instead of just `admin`.
- `src/components/auth/ProtectedRoute.tsx` — now checks AAL in addition to role: an elevated-role account whose session is still at aal1 gets redirected to `/admin/mfa-verify` or `/admin/mfa-setup` (whichever applies) instead of being let through. This is the frontend half of the AUTH-01 fix — the backend half (Phase 2 edit above) means it would have been enforced either way, but this makes it a good UX instead of a wall of 403s.
- `src/pages/admin/AdminLogin.tsx`, `src/pages/Login.tsx` — accept/route all four elevated roles through the MFA-aware path, not just `admin`.
- `src/pages/agency/AgencyLogin.tsx` — `role === "user"` → `role === "traveler"`; removed the now-nonexistent `agencyName` signup field (agency identity is created through the Phase 4 application flow against the new `agencies` table, not passed as signup metadata).
- `src/components/layout/Header.tsx`, `src/components/layout/MobileMenu.tsx` — same role-string rename, plus `getDashboardLink()` now routes all four elevated roles to `/admin`.
- `src/lib/audit.ts` — `logAdminAction()` rewritten to call the new `record-audit-log` edge function instead of a direct `supabase.from("audit_log").insert(...)` — the direct-insert approach is not just outdated but **structurally impossible now**: Phase 2 revoked client INSERT on `audit_logs` entirely.
- `src/pages/admin/Users.tsx` + `src/pages/admin/users/UserDetailDialog.tsx` + `src/pages/admin/users/UserChangeRoleDialog.tsx` — expanded to the 6-role set; fixed a real, separate bug found while touching this code: `userRole()` was reading role from `user_metadata` (self-editable) instead of `app_metadata`, meaning the admin panel's own role badges could show a value the account itself had set, not its real authorization (same bug class as `AUDIT_REPORT.md` AUTH-07/RLS-02, just not previously catalogued at this exact call site). Removed the now-redundant frontend `logAdminAction` calls for suspend/unsuspend/change_role/delete (the edge function logs these itself now — keeping both would double-log, and the frontend calls would fail anyway per the point above). Also fixed `openDetail()`'s enrichment queries, which referenced `reviews.user_id` (now `traveler_id`) and the now-gone `agency_applications` table (now `agency_users` → `agencies`/`agency_verification`).
- `src/pages/agency/AgencyOnboarding.tsx`, `src/pages/agency/AgencyBookings.tsx` — one-line fixes for `user.agencyName`, a field that no longer exists on `User` (agency identity moved to real tables in Phase 2). Not a redesign of either page — just kept them compiling with a reasonable fallback (`user.name`) until Phases 4/20 rebuild them properly against the new schema.

**Untouched, deliberately:** every other edge function (`create-payment-intent`, `stripe-webhook`, `cancel-booking`, `process-refund`, `process-payout`, `stripe-connect-onboard`, `upgrade-agency-role`, `send-welcome-email`, `send-agency-application-email`, `contact-form`, `delete-account`, `reap-stale-bookings`) — all Phase 4/11-19 territory, and all already broken against the Phase 2 schema regardless of anything in this phase. Every frontend page not listed above.

---

## How this was verified

Typecheck and lint first (both clean, zero errors, across the whole project — `npx tsc --noEmit -p .` and `eslint` on every touched file), then real runtime testing against the local Supabase stack, because this is exactly the kind of fix where "the code looks right" and "the code actually works" can diverge (see Phase 2's own report for three examples of that happening even with careful review):

1. **SQL-level AAL gating**, tested directly against Postgres with simulated JWT claims inside explicit transactions (the first attempt without an explicit transaction gave a false pass — `set_config(..., true)` is transaction-local, and auto-committing between statements silently no-ops it; caught and corrected before trusting the result):
   - `admin` role + `aal1` → `is_admin()` = false
   - `admin` role + `aal2` → `is_admin()` = true
   - `traveler` role + `aal2` → `is_admin()` = false (role check still applies regardless of AAL)
2. **JS-side AAL decoding**, unit-tested in isolation with crafted JWTs: correctly extracts `aal2`/`aal1`, and fails safe to `aal1` on a missing claim, malformed token, or `undefined` input.
3. **Full real HTTP integration test**, through actual GoTrue + Edge Functions endpoints on the local stack, using a real user created via the Admin API and a real TOTP factor (RFC 6238 code computed by hand in Node — no shortcuts):
   - New signup → confirmed `raw_app_meta_data.role = "traveler"` was actually set by the trigger (not just assumed from the code's fallback default).
   - Traveler calls `admin-users` → `403 "Requires one of: admin, super_admin"`.
   - Promoted to `admin`, signs in fresh (aal1, no MFA yet) → `403 "This action requires multi-factor authentication..."` — **this is the literal AUTH-01 fix, proven with a real edge-function call**, not just a code-review claim.
   - Enrolled a real TOTP factor, completed a real challenge/verify with a correctly-computed 6-digit code → session's JWT `aal` claim flips to `aal2` (confirmed by decoding the returned token).
   - Same admin, now aal2 → `admin-users` succeeds (`200`, correct stats).
   - Privilege ceiling: the same plain-admin caller attempting to grant `super_admin` to another user → `403 "Only a super_admin can grant..."`; granting `finance` to the same user → succeeds.
   - `audit_logs` — after the successful `change_role` call, queried the table directly: one row, correctly attributed, with accurate `before_state`/`after_state` (`{"role":"traveler"}` → `{"role":"finance"}`) — confirming the server-side audit path actually works, not just that it doesn't error.

This is the most thorough test pass so far in this redesign — the first phase where "does the security fix actually hold under a real attempted bypass" could be tested directly rather than only reasoned about.

---

## Direct fixes to prior audit findings

| Finding | Resolution |
|---|---|
| `AUDIT_REPORT.md` AUTH-01 (admin MFA bypassable — nothing server-side checked AAL) | Closed at both layers: SQL (`is_admin()` et al. now require aal2 unconditionally) and edge functions (`requirePlatformRole()`). Proven with a real bypass attempt in testing, not just closed in theory. |
| A new instance of the AUTH-07/RLS-02 pattern (`user_metadata` vs `app_metadata`) found in `UserDetailDialog.tsx`'s `userRole()` | Fixed — now reads `app_metadata` exclusively, matching every other role check in the codebase. |
| `AUDIT_REPORT.md` OPS-06 (agency role-escalation not audit-logged) — not directly in scope (that's the Phase 4 `upgrade-agency-role` function), but the general pattern of "admin actions must self-log server-side" is now established via `admin-users`/`record-audit-log` for Phase 4 to follow when it's rebuilt. | Pattern established, not yet applied to `upgrade-agency-role` itself (Phase 4). |

---

## What Phase 3 deliberately did not do

- **Did not build a separate approval workflow for large/sensitive financial actions** (target §61 — "consider approval workflows for large refunds, manual ledger adjustments..."). That's financial-controls scope (Phase 18/19/61-adjacent), layered on top of the role/AAL foundation this phase built, not a substitute for it.
- **Did not touch `upgrade-agency-role`** — deliberately left for Phase 4, since it's tightly coupled to the `agency_verification` workflow that phase owns, even though it's technically "a role change."
- **Did not rebuild `AgencyOnboarding.tsx`/`AgencyBookings.tsx`** beyond the one-line compile fixes described above — those pages' real rework (querying the new `agencies`/`booking` schema properly) is Phase 4/20's job.
- **Did not add rate limiting to login/signup/MFA attempts** (target §31's rate-limit list includes these) — Supabase Auth has some built-in protections, but explicit application-level rate limiting for these flows isn't in scope here; flagging for Phase 29 (security hardening).
- **Did not decide the exact FINANCE/SUPPORT permission matrix** beyond "which roles can reach which RLS-gated tables" (already encoded via `is_finance_or_admin()`/`is_support_or_admin()` in Phase 2). What a `support` user can actually *do* inside the admin UI (Phase 25) versus what `finance` can do is still to be designed.

## Risks / things to verify before Phase 4

- **`is_authenticated_aal2()`'s current design has no exemption path.** Once any account is promoted to an elevated role, it cannot do anything at all — including complete its own MFA setup via a route gated behind the same role check — until MFA is enrolled. This was confirmed working correctly in testing (`/admin/mfa-setup` and `/admin/mfa-verify` are not behind `ProtectedRoute` in `App.tsx`, so this isn't actually a lockout in practice), but it's worth stating explicitly: if a future change ever moves those two routes behind `ProtectedRoute`, a freshly-promoted admin would be locked out with no path to enroll. Don't do that.
- **The local `supabase/config.toml` MFA settings must match whatever the real target Supabase project has configured** — I enabled `enroll_enabled`/`verify_enabled` locally to make this phase testable at all; if the actual remote project (once `OPS-11` from the audit is resolved and a real project is linked) has these disabled, the entire admin portal becomes unreachable for anyone. Verify before any real deployment.
- **No migration exists yet to promote a first real `super_admin`.** Right now, exactly like the old system, someone has to reach into the database directly (`UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role":"super_admin"}'`) to bootstrap the very first admin account, since `admin-users` requires an existing admin to call it. This is normal (every system needs a bootstrap path) but should be documented in deployment docs (Phase 57), not left implicit.

Waiting for your go-ahead before Phase 4 (Agency onboarding and verification).
