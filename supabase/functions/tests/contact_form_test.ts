// Edge-function tests for contact-form (audit M2).
//
// Requires a running local stack (`supabase start`) with
// supabase/functions/.env setting TURNSTILE_SECRET_KEY to Cloudflare's
// published, non-secret test key (1x0000000000000000000000000000000AA,
// which always returns success regardless of the token sent) -- see
// that file's own comment. Without it, every submission is rejected
// closed (verifyTurnstile() treats a missing server secret as a hard
// failure, never as "skip verification"), which would make the
// "Turnstile passed" case below impossible to exercise at all.
//
// Run via: npm run test:edge (deno test --allow-net --allow-env supabase/functions/tests/)
import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { ANON_KEY, SUPABASE_URL } from "./_helpers/testAuth.ts";

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/contact-form`;

function post(body: unknown) {
  return fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

Deno.test("contact-form: missing turnstileToken -> 400", async () => {
  const res = await post({
    name: "Test User",
    email: `missing-token-${crypto.randomUUID()}@test.com`,
    message: "A message with no turnstileToken field at all.",
  });
  const body = await res.json();
  assertEquals(res.status, 400);
  assertNotEquals(body.error, undefined);
});

Deno.test("contact-form: valid submission with Turnstile's always-pass test secret -> 200", async () => {
  const res = await post({
    name: "Test User",
    email: `valid-${crypto.randomUUID()}@test.com`,
    message: "A genuine test message, long enough to pass validation.",
    turnstileToken: "any-value-the-test-secret-ignores-it",
  });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.success, true);
});

Deno.test("contact-form: exceeding the per-IP rate limit -> 429", async () => {
  // The IP rate limit (5/hour, keyed on the client IP — "unknown" here,
  // since no cf-connecting-ip/x-forwarded-for header is sent, but that's
  // still a single consistent bucket for this whole test run) is checked
  // BEFORE Turnstile verification, so no valid token is even needed to
  // reach and exceed it.
  let lastStatus = 0;
  let lastBody: { error?: string } = {};
  for (let i = 0; i < 7; i++) {
    const res = await post({
      name: "Rate Limit Test",
      email: `rate-limit-${i}-${crypto.randomUUID()}@test.com`,
      message: "Spamming the contact form to trip the per-IP rate limit.",
      turnstileToken: "any-value-the-test-secret-ignores-it",
    });
    lastStatus = res.status;
    lastBody = await res.json();
  }
  assertEquals(lastStatus, 429);
  assertEquals(lastBody.error, "Too many messages sent recently. Please try again later.");
});
