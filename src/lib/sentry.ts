import * as Sentry from "@sentry/react";

// This platform's production deployment plan is one subdomain per portal
// (www/partner/admin) — everything else (a bare custom domain, localhost,
// a preview deployment) falls back to "www", the traveler-facing default.
export type Portal = "www" | "partner" | "admin";

export function detectPortal(hostname: string = window.location.hostname): Portal {
  if (hostname.startsWith("partner.")) return "partner";
  if (hostname.startsWith("admin.")) return "admin";
  return "www";
}

const SENSITIVE_KEY_PATTERN = /password|token|secret|passport/i;

/** Recursively redacts any object key matching SENSITIVE_KEY_PATTERN. Used on request bodies and anything else that ends up on an event (extra context, breadcrumb data) — never trust that a secret could only ever show up in one specific field. */
function scrub<T>(value: T): T {
  if (Array.isArray(value)) return value.map(scrub) as T;
  if (value && typeof value === "object") {
    const clone: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      clone[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[Filtered]" : scrub(v);
    }
    return clone as T;
  }
  return value;
}

/**
 * Initializes Sentry only when VITE_SENTRY_DSN is set — with no DSN,
 * this is a no-op and every Sentry.* call elsewhere (ErrorBoundary,
 * logger.ts's forwarding) safely does nothing, so the app runs
 * identically either way. Call once, before rendering, from main.tsx.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_APP_ENV as string | undefined) || "development",
    tracesSampleRate: 0.1,
    integrations: [Sentry.browserTracingIntegration()],
    beforeSend(event) {
      if (event.request?.data) event.request.data = scrub(event.request.data);
      if (event.extra) event.extra = scrub(event.extra);
      if (event.contexts) event.contexts = scrub(event.contexts) as typeof event.contexts;
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((b) => (b.data ? { ...b, data: scrub(b.data) } : b));
      }
      return event;
    },
  });

  Sentry.setTag("portal", detectPortal());
}

export { Sentry };
