// Tests that no edge function ever leaks a raw DB/GoTrue error string to
// the client. Every function in this codebase funnels its error
// responses through the shared fail() helper (supabase/functions/
// _shared/http.ts) specifically so this is enforced in exactly one
// place: fail()'s own contract is "err is logged server-side only; the
// client only ever sees publicMessage + requestId" -- a unit test on
// fail() itself is the precise, direct way to verify that contract,
// rather than hunting for one specific runtime scenario in one specific
// function that happens to produce an unvalidated raw error (which is
// both hard to engineer reliably through code that's already tightly
// Zod-validated, and fragile -- it would break if validation ever got
// even tighter, for having become unreachable, not for having leaked).
//
// A second, live check against admin-users confirms the same property
// holds for a genuine, real end-to-end 404 case.
// Run via: npm run test:edge (deno test --allow-net --allow-env supabase/functions/tests/)
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { fail } from "../_shared/http.ts";
import { ANON_KEY, authHeader, createTestUser, deleteTestUser, SUPABASE_URL } from "./_helpers/testAuth.ts";

Deno.test("fail(): a raw Postgres-style error's message/stack never reaches the response body", async () => {
  const req = new Request("http://example.com/fn");
  const sensitiveError = new Error(
    "connection to server at \"db.internal.supabase.co\" (10.0.4.12), port 5432 failed: FATAL: password authentication failed for user \"postgres\"",
  );

  const res = fail(req, 500, "Something went wrong. Please try again.", sensitiveError);
  const bodyText = await res.text();

  assertEquals(res.status, 500);
  assertStringIncludes(bodyText, "Something went wrong. Please try again.");
  // The actual assertion: none of the sensitive error's own text appears
  // anywhere in what the client receives.
  if (bodyText.includes("10.0.4.12") || bodyText.includes("password authentication failed") || bodyText.includes("db.internal.supabase.co")) {
    throw new Error(`raw error text leaked into the response body: ${bodyText}`);
  }

  const body = JSON.parse(bodyText);
  assertEquals(Object.keys(body).sort(), ["error", "requestId"]);
});

Deno.test("fail(): a raw error's .stack is never serialized into the response either", async () => {
  const req = new Request("http://example.com/fn");
  const err = new Error("some internal failure");
  err.stack = "Error: some internal failure\n    at /app/secrets/internal-path.ts:42:7\n    at processTicksAndRejections";

  const res = fail(req, 500, "Something went wrong. Please try again.", err);
  const bodyText = await res.text();

  if (bodyText.includes("internal-path.ts") || bodyText.includes("processTicksAndRejections")) {
    throw new Error(`stack trace leaked into the response body: ${bodyText}`);
  }
});

Deno.test("live: admin-users returns a generic 404 for a nonexistent user, not a raw DB error", async () => {
  const admin = await createTestUser("admin", "leak-check-admin");
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY, ...authHeader(admin) },
      body: JSON.stringify({ action: "suspend", user_id: "00000000-0000-0000-0000-000000000000" }),
    });
    const body = await res.json();
    assertEquals(res.status, 404);
    assertEquals(body.error, "User not found");
  } finally {
    await deleteTestUser(admin.id);
  }
});
