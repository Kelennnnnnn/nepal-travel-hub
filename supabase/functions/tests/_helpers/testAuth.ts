// Shared fixture-user helper for edge-function tests. Creates a real
// GoTrue user via the Admin API, signs in with a password to get an
// aal1 session, and — for elevated roles (admin/super_admin/support/
// finance), which requirePlatformRole() unconditionally rejects below
// aal2 — enrolls and verifies a real TOTP factor to obtain a genuine
// aal2 access token. This exercises the actual MFA gate end-to-end
// rather than faking the aal claim (which isn't possible over real
// HTTP the way `set_config('request.jwt.claims', ...)` fakes it inside
// a pgTAP session).
import { createClient } from "@supabase/supabase-js";
import { generateTotpCode } from "./totp.ts";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

export type PlatformRole = "traveler" | "agency" | "admin" | "super_admin" | "support" | "finance";

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

const ELEVATED_ROLES: PlatformRole[] = ["admin", "super_admin", "support", "finance"];
const TEST_PASSWORD = "Test-Password-1234!";

export function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Creates a confirmed user with the given platform role and returns a session access token (aal2 for elevated roles, aal1 otherwise). */
export async function createTestUser(role: PlatformRole, emailPrefix: string): Promise<TestUser> {
  const admin = adminClient();
  const email = `${emailPrefix}-${crypto.randomUUID()}@test.com`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    app_metadata: { role },
  });
  if (createErr || !created.user) {
    throw new Error(`Failed to create test user: ${createErr?.message}`);
  }
  const userId = created.user.id;

  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: signIn, error: signInErr } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (signInErr || !signIn.session) {
    throw new Error(`Failed to sign in test user: ${signInErr?.message}`);
  }

  if (!ELEVATED_ROLES.includes(role)) {
    return { id: userId, email, accessToken: signIn.session.access_token };
  }

  // Elevate to aal2: enroll a real TOTP factor and verify it with a
  // genuinely-computed code, exactly as a real admin completing their
  // first MFA setup would (minus the human reading the code off a phone).
  const { data: enrolled, error: enrollErr } = await client.auth.mfa.enroll({ factorType: "totp" });
  if (enrollErr || !enrolled) {
    throw new Error(`Failed to enroll MFA: ${enrollErr?.message}`);
  }
  const secret = enrolled.totp.secret;
  const factorId = enrolled.id;

  const { data: challenge, error: challengeErr } = await client.auth.mfa.challenge({ factorId });
  if (challengeErr || !challenge) {
    throw new Error(`Failed to challenge MFA: ${challengeErr?.message}`);
  }

  const code = await generateTotpCode(secret);
  const { data: verified, error: verifyErr } = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (verifyErr || !verified) {
    throw new Error(`Failed to verify MFA: ${verifyErr?.message}`);
  }

  return { id: userId, email, accessToken: verified.access_token };
}

const TEST_DB_URL = Deno.env.get("SECURITY_TEST_DB_URL") ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * Deletes a fixture user and any audit_logs rows it created as actor_id.
 * audit_logs has no ON DELETE rule on that FK, and deliberately has no
 * DELETE/UPDATE grant for service_role at all (confirmed: `select
 * grantee, privilege_type from information_schema.role_table_grants
 * where table_name='audit_logs'` lists only INSERT/SELECT/REFERENCES/
 * TRIGGER for service_role) -- a real audit trail must stay append-only
 * even to the service role, not just to RLS-bound callers. So a test
 * user who successfully completed a logged admin-users action (e.g.
 * suspend) can't be cleaned up via the normal service-role client at
 * all; this shells out to psql as the Postgres superuser instead,
 * exactly the same narrow, test-infra-only escape hatch scripts/
 * generate-security-tests.ts already uses to introspect the schema.
 */
export async function deleteTestUser(userId: string): Promise<void> {
  const admin = adminClient();

  const psql = new Deno.Command("psql", {
    args: [TEST_DB_URL, "-c", `delete from public.audit_logs where actor_id = '${userId}'`],
  });
  const { success, stderr } = await psql.output();
  if (!success) {
    throw new Error(`Failed to clean up audit_logs for test user ${userId}: ${new TextDecoder().decode(stderr)}`);
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`Failed to clean up test user ${userId}: ${error.message}`);
  }
}

export function authHeader(user: TestUser): Record<string, string> {
  return { Authorization: `Bearer ${user.accessToken}`, apikey: ANON_KEY };
}

/**
 * Deletes a fixture agency (and, via ON DELETE CASCADE, its
 * agency_verification/agency_users/listings/departures/etc rows) created
 * by a test, e.g. via save_agency_draft(). Deleting only the owning
 * test user does NOT clean this up -- agencies has no FK to auth.users
 * at all, so an orphaned row would otherwise linger and pollute any
 * other test/dev session's unfiltered `count(*) from agencies` checks
 * sharing this local database (exactly what broke supabase/tests/
 * onboarding-transaction.sql the first time this test suite ran without
 * this cleanup). Same psql-as-superuser escape hatch as deleteTestUser().
 */
export async function deleteTestAgency(agencyId: string): Promise<void> {
  const psql = new Deno.Command("psql", {
    args: [TEST_DB_URL, "-c", `delete from public.agencies where id = '${agencyId}'`],
  });
  const { success, stderr } = await psql.output();
  if (!success) {
    throw new Error(`Failed to clean up test agency ${agencyId}: ${new TextDecoder().decode(stderr)}`);
  }
}
