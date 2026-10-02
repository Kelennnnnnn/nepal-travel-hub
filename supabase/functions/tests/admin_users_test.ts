// Edge-function tests for admin-users (audit C3): the privilege ceiling
// used to check only the role being GRANTED (change_role's `role` param),
// never the TARGET's current role -- a plain admin could suspend,
// delete, or change_role a super_admin (or another admin), since
// suspend/unsuspend/delete had no role check on the target at all.
// Every action that takes a user_id now fetches the target first and
// refuses unless the caller is a super_admin, whenever the target is
// currently admin/super_admin.
//
// Requires a running local stack (`supabase start`) with SUPABASE_URL/
// SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY in the environment (see
// README_DEPLOY.md). Uses real MFA-elevated (aal2) sessions via
// _helpers/testAuth.ts, since requirePlatformRole() unconditionally
// rejects any elevated-role caller below aal2.
// Run via: npm run test:edge (deno test --allow-net --allow-env supabase/functions/tests/)
import { assertEquals } from "jsr:@std/assert@1";
import { adminClient, ANON_KEY, authHeader, createTestUser, deleteTestUser, SUPABASE_URL, type TestUser } from "./_helpers/testAuth.ts";

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/admin-users`;

function call(caller: TestUser, body: unknown) {
  return fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY, ...authHeader(caller) },
    body: JSON.stringify(body),
  });
}

async function isBanned(userId: string): Promise<boolean> {
  const { data } = await adminClient().auth.admin.getUserById(userId);
  const bannedUntil = data?.user?.banned_until;
  return !!bannedUntil && new Date(bannedUntil) > new Date();
}

Deno.test("admin-users C3: plain admin cannot suspend a super_admin", async () => {
  const plainAdmin = await createTestUser("admin", "c3-plain-admin");
  const targetSuperAdmin = await createTestUser("super_admin", "c3-target-superadmin");
  try {
    const res = await call(plainAdmin, { action: "suspend", user_id: targetSuperAdmin.id });
    const body = await res.json();
    assertEquals(res.status, 403);
    assertEquals(body.error, "Only a super_admin can modify an admin or super_admin account.");
    assertEquals(await isBanned(targetSuperAdmin.id), false);
  } finally {
    await deleteTestUser(plainAdmin.id);
    await deleteTestUser(targetSuperAdmin.id);
  }
});

Deno.test("admin-users C3: plain admin cannot delete another admin", async () => {
  const plainAdmin = await createTestUser("admin", "c3-plain-admin2");
  const targetAdmin = await createTestUser("admin", "c3-target-admin");
  try {
    const res = await call(plainAdmin, { action: "delete", user_id: targetAdmin.id });
    const body = await res.json();
    assertEquals(res.status, 403);
    assertEquals(body.error, "Only a super_admin can modify an admin or super_admin account.");

    const { data } = await adminClient().auth.admin.getUserById(targetAdmin.id);
    assertEquals(data?.user?.id, targetAdmin.id, "target admin account still exists");
  } finally {
    await deleteTestUser(plainAdmin.id);
    await deleteTestUser(targetAdmin.id);
  }
});

Deno.test("admin-users C3: plain admin cannot change_role another admin's role", async () => {
  const plainAdmin = await createTestUser("admin", "c3-plain-admin3");
  const targetAdmin = await createTestUser("admin", "c3-target-admin2");
  try {
    const res = await call(plainAdmin, { action: "change_role", user_id: targetAdmin.id, role: "traveler" });
    const body = await res.json();
    assertEquals(res.status, 403);
    assertEquals(body.error, "Only a super_admin can modify an admin or super_admin account.");

    const { data } = await adminClient().auth.admin.getUserById(targetAdmin.id);
    assertEquals(data?.user?.app_metadata?.role, "admin", "target's role is unchanged");
  } finally {
    await deleteTestUser(plainAdmin.id);
    await deleteTestUser(targetAdmin.id);
  }
});

Deno.test("admin-users C3: plain admin CAN still suspend a non-admin target (the legitimate path)", async () => {
  const plainAdmin = await createTestUser("admin", "c3-plain-admin4");
  const targetTraveler = await createTestUser("traveler", "c3-target-traveler");
  try {
    const res = await call(plainAdmin, { action: "suspend", user_id: targetTraveler.id });
    assertEquals(res.status, 200);
    assertEquals(await isBanned(targetTraveler.id), true);
  } finally {
    await deleteTestUser(plainAdmin.id);
    await deleteTestUser(targetTraveler.id);
  }
});

Deno.test("admin-users C3: a super_admin CAN suspend a plain admin", async () => {
  const superAdmin = await createTestUser("super_admin", "c3-superadmin2");
  const targetAdmin = await createTestUser("admin", "c3-target-admin3");
  try {
    const res = await call(superAdmin, { action: "suspend", user_id: targetAdmin.id });
    assertEquals(res.status, 200);
    assertEquals(await isBanned(targetAdmin.id), true);
  } finally {
    await deleteTestUser(superAdmin.id);
    await deleteTestUser(targetAdmin.id);
  }
});
