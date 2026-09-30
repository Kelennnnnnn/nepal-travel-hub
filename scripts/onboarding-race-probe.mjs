// Acceptance check for the onboarding race fix: fires 5 concurrent
// save_draft calls (through the real agency-application edge function
// HTTP endpoint, not a direct RPC call — this exercises the whole stack a
// real double-click/flaky-retry would) for ONE new user and verifies
// exactly one agency/owner/verification row exists afterward, not more.
//
// Run via: node scripts/onboarding-race-probe.mjs   (local stack must be running)
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";

const admin = createClient(URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

function b64url(input) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function mintToken(sub) {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    sub, aud: "authenticated", role: "authenticated", iss: "supabase-demo",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const data = `${header}.${payload}`;
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

async function callSaveDraft(token, companyName) {
  const res = await fetch(`${URL}/functions/v1/agency-application`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save_draft", fields: { companyName } }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

(async () => {
  const email = `race-probe-${Date.now()}@test.com`;
  const { data: userData, error: createErr } = await admin.auth.admin.createUser({
    email, password: "Test1234!!", email_confirm: true, app_metadata: { role: "traveler" },
  });
  if (createErr) { console.error("Failed to create test user:", createErr.message); process.exit(1); }
  const userId = userData.user.id;
  const token = mintToken(userId);

  console.log(`Test user: ${email} (${userId})`);
  console.log("Firing 5 concurrent save_draft calls...");

  const results = await Promise.all(
    Array.from({ length: 5 }, (_, i) => callSaveDraft(token, `Race Probe Agency ${i}`)),
  );

  results.forEach((r, i) => console.log(`  call ${i}: status=${r.status} agency_id=${r.json.agency_id ?? r.json.error}`));

  const { count: agencyUserCount } = await admin
    .from("agency_users")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("agency_role", "owner")
    .is("removed_at", null);

  const { data: memberships } = await admin
    .from("agency_users")
    .select("agency_id")
    .eq("user_id", userId)
    .eq("agency_role", "owner")
    .is("removed_at", null);
  const agencyIds = [...new Set((memberships ?? []).map((m) => m.agency_id))];

  const { count: agencyCount } = await admin
    .from("agencies")
    .select("id", { count: "exact", head: true })
    .in("id", agencyIds.length ? agencyIds : ["00000000-0000-0000-0000-000000000000"]);

  const { count: verificationCount } = await admin
    .from("agency_verification")
    .select("id", { count: "exact", head: true })
    .in("agency_id", agencyIds.length ? agencyIds : ["00000000-0000-0000-0000-000000000000"]);

  console.log(`\nowner rows: ${agencyUserCount}, distinct agencies: ${agencyIds.length}, agencies rows: ${agencyCount}, verification rows: ${verificationCount}`);

  const pass = agencyUserCount === 1 && agencyIds.length === 1 && agencyCount === 1 && verificationCount === 1;
  console.log(pass ? "PASS: exactly one agency/owner/verification row." : "FAIL: race condition left extra/orphaned rows.");

  // cleanup
  for (const id of agencyIds) await admin.from("agencies").delete().eq("id", id).then(() => {});
  await admin.auth.admin.deleteUser(userId).catch(() => {});

  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error("ERROR", e); process.exit(1); });
