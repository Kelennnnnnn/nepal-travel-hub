// Unit tests for the shared CORS allowlist
// (supabase/functions/_shared/http.ts's corsHeaders()/parseAllowedOrigins()).
//
// Deliberately NOT an HTTP test against the running local stack: the
// Supabase CLI's local Kong gateway (which proxies
// http://127.0.0.1:54321/functions/v1/*) carries its own blanket
// `Access-Control-Allow-Origin: *` CORS plugin for local-dev convenience
// that overwrites whatever the function itself returns -- confirmed by
// comparing `curl -D -` output through Kong against this module's own
// corsHeaders() return value directly. That Kong-level behavior is a
// local-CLI-only artifact, not how a real hosted project's edge functions
// are served, and testing through it would validate the wrong layer.
// Importing and calling corsHeaders()/handleOptions() directly exercises
// exactly the logic that matters, with no gateway in between.
//
// Must run with ALLOWED_ORIGINS unset and ENVIRONMENT=development (or
// unset) in the test process's own environment -- http.ts computes its
// allowlist once, at module-import time, from those two vars, matching
// this local stack's supabase/functions/.env.
// Run via: npm run test:edge (deno test --allow-net --allow-env supabase/functions/tests/)
import { assertEquals } from "jsr:@std/assert@1";
import { corsHeaders, handleOptions } from "../_shared/http.ts";

const ALLOWED_ORIGIN = "http://localhost:5173";
const DISALLOWED_ORIGIN = "https://evil-attacker.example.com";

function reqWithOrigin(origin: string): Request {
  return new Request("http://example.com/fn", { headers: { Origin: origin } });
}

Deno.test("corsHeaders: an allowlisted origin is echoed back", () => {
  const headers = corsHeaders(reqWithOrigin(ALLOWED_ORIGIN));
  assertEquals(headers["Access-Control-Allow-Origin"], ALLOWED_ORIGIN);
  assertEquals(headers["Vary"], "Origin");
});

Deno.test("corsHeaders: a non-allowlisted origin is never echoed back -- no wildcard fallback", () => {
  const headers = corsHeaders(reqWithOrigin(DISALLOWED_ORIGIN));
  assertEquals(headers["Access-Control-Allow-Origin"], undefined);
});

Deno.test("corsHeaders: no Origin header at all -- no Access-Control-Allow-Origin, no crash", () => {
  const headers = corsHeaders(new Request("http://example.com/fn"));
  assertEquals(headers["Access-Control-Allow-Origin"], undefined);
});

Deno.test("handleOptions: an OPTIONS preflight from a disallowed origin gets a 200 with no allow-origin header", async () => {
  const req = new Request("http://example.com/fn", { method: "OPTIONS", headers: { Origin: DISALLOWED_ORIGIN } });
  const res = handleOptions(req);
  if (!res) throw new Error("expected handleOptions to short-circuit an OPTIONS request");
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), null);
});

Deno.test("handleOptions: an OPTIONS preflight from an allowed origin gets it echoed back", async () => {
  const req = new Request("http://example.com/fn", { method: "OPTIONS", headers: { Origin: ALLOWED_ORIGIN } });
  const res = handleOptions(req);
  if (!res) throw new Error("expected handleOptions to short-circuit an OPTIONS request");
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN);
});
