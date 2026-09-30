// Shared HTTP plumbing for every edge function — CORS (env-driven
// allowlist, fails closed in production), consistent success/error
// response shapes that never leak a raw DB/GoTrue error string to the
// client, request-body parsing + Zod validation, a client authenticated
// as the CALLER (for RPCs whose SECURITY DEFINER body relies on
// auth.uid()), and idempotency-key handling for mutating actions.
//
// Every function should call handleOptions(req) first, then use ok()/
// fail() for every response instead of building its own Response objects
// — this is what actually eliminates the per-file corsHeaders()/json()
// duplicates this hardening pass exists to remove.

import { createClient } from "@supabase/supabase-js";
import type { ZodSchema } from "zod";
import { scrub } from "./guards.ts";

const ENVIRONMENT = (Deno.env.get("ENVIRONMENT") ?? "").toLowerCase();
const IS_PRODUCTION = ENVIRONMENT === "production";

function parseAllowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const parsed = raw.split(",").map((o) => o.trim()).filter(Boolean);
  if (parsed.length > 0) return parsed;
  if (IS_PRODUCTION) return [];
  // Local dev only — IS_PRODUCTION being false is what gates this, so
  // this default is never reachable when ENVIRONMENT=production.
  return ["http://localhost:8080", "http://localhost:5173"];
}

const ALLOWED_ORIGINS = parseAllowedOrigins();
const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type, idempotency-key";
const ALLOWED_METHODS = "GET, POST, OPTIONS";

function isMisconfigured(): boolean {
  // Fail closed: in production, an empty allowlist is a deployment
  // mistake (an env var that didn't get set), not "allow everything" —
  // the old per-file `Deno.env.get("ALLOWED_ORIGIN") ?? "*"` pattern this
  // replaces silently fell back to a wildcard in exactly this situation.
  return IS_PRODUCTION && ALLOWED_ORIGINS.length === 0;
}

/** CORS headers for this specific request — echoes Origin only if it's on the allowlist. */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    // A cache/CDN in front of this function must not serve one origin's
    // preflight response to a different origin.
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function misconfiguredResponse(): Response {
  return new Response(JSON.stringify({ error: "Server misconfigured" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}

function deriveFnName(req: Request): string {
  return new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "unknown";
}

// ── Per-request id (observability) ──────────────────────────────────────
// One requestId per request, established once by withRequestLog() below
// and looked up here by fail() — so every fail() call across every
// function automatically shares the same id as that request's summary log
// line, with zero changes needed at any individual fail() call site.
// Keyed by the Request object itself: a WeakMap is safe against the
// edge-runtime's `per_worker` policy reusing one JS context across many
// requests (a module-level plain variable would leak between them; a
// WeakMap entry is scoped to this exact Request instance and is GC'd once
// the request finishes, no manual cleanup needed).
const requestIds = new WeakMap<Request, string>();

/** The requestId assigned to this request — set up by withRequestLog(). Exposed so handlers can pass it into record_audit_log()'s p_request_id. Falls back to minting one on first use if withRequestLog wasn't called (shouldn't happen — every function wraps its handler in it) rather than returning undefined. */
export function getRequestId(req: Request): string {
  let id = requestIds.get(req);
  if (!id) {
    id = crypto.randomUUID();
    requestIds.set(req, id);
  }
  return id;
}

export interface RequestLogContext {
  userId?: string;
  action?: string;
}

/**
 * Wraps a function's entire request-handling body (call AFTER
 * handleOptions(req) has already let the request through). Establishes
 * this request's id, runs `handler`, and — no matter which branch it
 * returned through, success or failure — logs exactly ONE structured
 * summary line: {fn, action, requestId, userId, status, durationMs}. This
 * is separate from fail()'s own per-call diagnostic logging (which can
 * fire zero, one, or more times depending on the handler); this line
 * always fires exactly once, giving every request a fixed-shape access-log
 * entry regardless of outcome.
 *
 * `handler` receives a mutable RequestLogContext — set ctx.userId as soon
 * as the caller is known (e.g. right after verifyCaller()) and ctx.action
 * as soon as the request body is parsed (e.g. body.action), so they're
 * available for the summary line even though neither is known up front.
 */
export async function withRequestLog(
  req: Request,
  handler: (ctx: RequestLogContext) => Promise<Response>,
): Promise<Response> {
  const requestId = getRequestId(req);
  const fn = deriveFnName(req);
  const ctx: RequestLogContext = {};
  const t0 = performance.now();

  let response: Response;
  try {
    response = await handler(ctx);
  } catch (err) {
    // Every handler already catches its own errors and returns via fail()
    // — this is a last-resort net so the summary line below still gets
    // written even if something truly unexpected escapes uncaught.
    response = fail(req, 500, "Something went wrong. Please try again.", err);
  }

  console.log(JSON.stringify({
    level: "info",
    fn,
    action: ctx.action ?? null,
    requestId,
    userId: ctx.userId ?? null,
    status: response.status,
    durationMs: Math.round(performance.now() - t0),
  }));

  return response;
}

/**
 * Call first in every Deno.serve handler:
 *   const early = handleOptions(req);
 *   if (early) return early;
 * Returns a response (and short-circuits the request) for the fail-closed
 * misconfiguration case or an OPTIONS preflight; returns null otherwise so
 * the caller continues.
 */
export function handleOptions(req: Request): Response | null {
  if (isMisconfigured()) return misconfiguredResponse();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  return null;
}

export function ok(req: Request, body: unknown, status = 200): Response {
  if (isMisconfigured()) return misconfiguredResponse();
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/**
 * Generates a requestId, logs one structured JSON line server-side
 * (secrets scrubbed via guards.ts scrub()), and returns a client-safe
 * {error, requestId} response. `publicMessage` is what the client sees —
 * `err`'s own message/stack never reaches the response body.
 */
export function fail(
  req: Request,
  status: number,
  publicMessage: string,
  err?: unknown,
  ctx?: Record<string, unknown>,
): Response {
  if (isMisconfigured()) return misconfiguredResponse();

  const requestId = getRequestId(req);
  const fn = deriveFnName(req);
  const errInfo = err instanceof Error
    ? { name: err.name, message: err.message }
    : err !== undefined
    ? { message: String(err) }
    : undefined;

  console.error(JSON.stringify({
    level: status >= 500 ? "error" : "warn",
    requestId,
    fn,
    msg: publicMessage,
    err: errInfo,
    ...(ctx ? (scrub(ctx) as Record<string, unknown>) : {}),
  }));

  return new Response(JSON.stringify({ error: publicMessage, requestId }), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/** Thrown by parseJson() on invalid JSON or a failed schema check — callers should catch this and route it through fail(). */
export class HttpError extends Error {
  constructor(public status: number, public publicMessage: string) {
    super(publicMessage);
  }
}

/** Parses the request body as JSON and validates it against `schema`. Throws HttpError(400) on either failure — never a raw parser/Zod stack trace. */
export async function parseJson<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path?.length ? `${first.path.join(".")}: ` : "";
    throw new HttpError(400, `${path}${first?.message ?? "Invalid request body"}`);
  }
  return result.data;
}

/**
 * A Supabase client authenticated as the CALLER (their own bearer token,
 * not the service-role key). Use this for any RPC whose SECURITY DEFINER
 * body relies on auth.uid()/is_admin() resolving to the real caller — the
 * service-role key's JWT has no `sub` claim at all, so auth.uid() would be
 * NULL and every such check would fail.
 */
export function userClient(req: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

function serviceRoleAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Idempotency for mutating actions (supabase/migrations/20260917000015_
 * idempotency_keys.sql). If the request carries an Idempotency-Key header
 * and a stored response already exists for (key, userId, fn), returns
 * that stored response unchanged instead of re-running `handler` — so a
 * retried POST never repeats a side effect (sending a second email,
 * writing a second row). Requests with no Idempotency-Key header run
 * normally, uncached, every time.
 */
export async function withIdempotency(
  req: Request,
  userId: string,
  fn: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  const key = req.headers.get("Idempotency-Key");
  if (!key) return handler();

  const admin = serviceRoleAdmin();

  const { data: existing } = await admin
    .from("idempotency_keys")
    .select("response, status")
    .eq("key", key)
    .eq("user_id", userId)
    .eq("fn", fn)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify(existing.response), {
      status: existing.status,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const response = await handler();

  // Only cache a genuinely-settled response (2xx/4xx) — a 5xx may be a
  // transient failure the client should actually be able to retry for
  // real, not something to freeze under this key forever.
  if (response.status < 500) {
    const bodyText = await response.clone().text();
    let bodyJson: unknown;
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = { raw: bodyText };
    }

    const { error: storeErr } = await admin.from("idempotency_keys").insert({
      key, user_id: userId, fn, response: bodyJson, status: response.status,
    });
    // A unique-violation here means a concurrent request already stored a
    // response for this exact key — that's fine, not an error worth
    // logging; whichever response actually reached the client already, it
    // still has the guarantee this exists for. Anything else is worth
    // knowing about even though it doesn't change what we return here.
    if (storeErr && storeErr.code !== "23505") {
      console.error(JSON.stringify({ level: "warn", msg: "idempotency store failed", err: storeErr.message, key, fn }));
    }
  }

  return response;
}
