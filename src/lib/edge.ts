import { supabase } from "@/lib/supabase";

// Wraps supabase.functions.invoke() with an Idempotency-Key header, so a
// retried mutating call (a double-click, a network retry, re-submitting
// after a transient failure) replays the server's stored response instead
// of repeating a side effect — sending a second email, writing a second
// row. See supabase/functions/_shared/http.ts's withIdempotency() and
// supabase/migrations/20260917000015_idempotency_keys.sql.
//
// Also normalizes error handling: supabase-js's FunctionsHttpError only
// exposes a generic message by default — this reads the actual
// {error, requestId} body the edge function sent (via http.ts's fail()),
// which is what every one of this project's edge functions returns.

export interface InvokeEdgeOptions {
  body?: Record<string, unknown>;
  /**
   * Reuse the SAME key across retries of one logical user action (e.g. the
   * user clicking "Try again" after a failure) so the retry is safely
   * deduped server-side. Omit for a one-shot call — a fresh key is minted
   * automatically.
   */
  idempotencyKey?: string;
}

export interface InvokeEdgeError {
  message: string;
  requestId?: string;
}

export async function invokeEdge<T = unknown>(
  functionName: string,
  options: InvokeEdgeOptions = {},
): Promise<{ data: T | null; error: InvokeEdgeError | null }> {
  const idempotencyKey = options.idempotencyKey ?? crypto.randomUUID();

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: options.body ?? {},
    headers: { "Idempotency-Key": idempotencyKey },
  });

  if (error) {
    let message = error.message;
    let requestId: string | undefined;
    if ("context" in error && error.context instanceof Response) {
      try {
        const body = await error.context.clone().json();
        if (typeof body?.error === "string") message = body.error;
        if (typeof body?.requestId === "string") requestId = body.requestId;
      } catch {
        // Fall through to the default error message.
      }
    }
    return { data: null, error: { message, requestId } };
  }

  if (data?.error) {
    // A 2xx-shaped response the function itself flagged as an error body
    // (some call sites check data.error rather than relying on the
    // FunctionsHttpError throw path) — same normalization either way.
    return { data: null, error: { message: data.error, requestId: data.requestId } };
  }

  return { data: data as T, error: null };
}

/**
 * A stable idempotency key for one "logical action" (e.g. "delete my
 * account", "invite bob@example.com as manager") that a component can
 * generate once and reuse across retries of that same action within a
 * single mount — call this in the handler right before the first attempt,
 * not on every render.
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
