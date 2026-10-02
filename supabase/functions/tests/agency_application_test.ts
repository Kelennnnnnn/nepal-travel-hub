// Edge-function tests for agency-application:
// - idempotency replay (supabase/functions/_shared/http.ts's withIdempotency):
//   a retried POST with the same Idempotency-Key must return the exact
//   cached response rather than re-running the handler (and therefore
//   never re-applying a second, different write).
// - onboarding concurrency (supabase/migrations/20260917000013_
//   onboarding_transaction.sql): two genuinely concurrent save_draft
//   calls from the same user must still result in exactly one agency,
//   via save_agency_draft()'s own advisory lock -- this is the real,
//   parallel-HTTP-request version of the sequential proxy pgTAP can
//   exercise (supabase/tests/security/exploits/onboarding_concurrency_
//   single_agency.sql), and the thing scripts/onboarding-race-probe.mjs
//   already covers at a larger scale (5 concurrent requests, see
//   package.json's test:onboarding-race).
// Run via: npm run test:edge (deno test --allow-net --allow-env supabase/functions/tests/)
import { assertEquals } from "jsr:@std/assert@1";
import { ANON_KEY, authHeader, createTestUser, deleteTestAgency, deleteTestUser, SUPABASE_URL, type TestUser } from "./_helpers/testAuth.ts";

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/agency-application`;

function call(caller: TestUser, body: unknown, idempotencyKey?: string) {
  return fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      ...authHeader(caller),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

Deno.test("agency-application: idempotency replay returns the cached response, never re-runs the write", async () => {
  const traveler = await createTestUser("traveler", "idem-traveler");
  let agencyId: string | undefined;
  try {
    const idemKey = crypto.randomUUID();

    const first = await call(
      traveler,
      { action: "save_draft", fields: { companyName: "Idempotency Test Agency", city: "Kathmandu" } },
      idemKey,
    );
    const firstBody = await first.json();
    agencyId = firstBody.agency_id;
    assertEquals(first.status, 200);

    // Same key, DIFFERENT body -- if this actually re-ran, it would
    // either create a second agency or rename the first one. It must
    // instead return the exact first response untouched.
    const second = await call(
      traveler,
      { action: "save_draft", fields: { companyName: "A Completely Different Name", city: "Pokhara" } },
      idemKey,
    );
    const secondBody = await second.json();
    assertEquals(second.status, 200);
    assertEquals(secondBody, firstBody, "replayed response is byte-identical to the first -- the handler did not re-run");
  } finally {
    if (agencyId) await deleteTestAgency(agencyId);
    await deleteTestUser(traveler.id);
  }
});

Deno.test("agency-application: two concurrent save_draft calls for the same user create exactly one agency", async () => {
  const traveler = await createTestUser("traveler", "race-traveler");
  let agencyId: string | undefined;
  try {
    const [resA, resB] = await Promise.all([
      call(traveler, { action: "save_draft", fields: { companyName: "Race Agency A", city: "Kathmandu" } }),
      call(traveler, { action: "save_draft", fields: { companyName: "Race Agency B", city: "Pokhara" } }),
    ]);
    const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()]);
    agencyId = bodyA.agency_id;

    assertEquals(resA.status, 200);
    assertEquals(resB.status, 200);
    assertEquals(bodyA.agency_id, bodyB.agency_id, "both concurrent calls resolve to the SAME agency id -- no orphan was created");
  } finally {
    if (agencyId) await deleteTestAgency(agencyId);
    await deleteTestUser(traveler.id);
  }
});
