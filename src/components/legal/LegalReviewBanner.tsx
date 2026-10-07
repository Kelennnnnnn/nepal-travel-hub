import { AlertTriangle } from "lucide-react";

/**
 * Flags a legal page's text as not yet approved by counsel. Hidden in
 * production (same VITE_APP_ENV gate as src/lib/sentry.ts) — this is a
 * drafting aid for the team, never something a real visitor should see.
 * See docs/LEGAL_REVIEW.md for the full list of pages/paragraphs pending
 * review.
 */
export function LegalReviewBanner() {
  const env = (import.meta.env.VITE_APP_ENV as string | undefined) || "development";
  if (env === "production") return null;

  return (
    <div className="mb-8 flex items-start gap-3 rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-amber-900 dark:text-amber-200">
      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="font-semibold">LEGAL REVIEW REQUIRED</p>
        <p className="text-amber-800/90 dark:text-amber-200/80">
          This page restates current product rules but has not been approved by a Nepal-qualified
          lawyer. Do not treat it as final. See{" "}
          <code className="font-mono text-xs">docs/LEGAL_REVIEW.md</code> for the review checklist.
          This banner is hidden in production.
        </p>
      </div>
    </div>
  );
}
