// Single source of truth for date/time display, replacing ~12 ad-hoc
// formatDate/formatDateTime helpers scattered across pages with mixed
// locales ("en-US", undefined) and — for a few of them — a real bug: a
// plain date-only string like "2026-12-01" parsed via `new Date(str)`
// directly is interpreted as UTC midnight, so a viewer west of UTC sees
// the day BEFORE the real one. formatTripDate() avoids that by appending
// "T00:00:00" (no offset) before parsing, which the spec interprets as
// LOCAL midnight — i.e. the calendar date itself, not a UTC instant.

/** A date-only value (e.g. departure_date, booking date) — same calendar day for every viewer, regardless of timezone. */
export function formatTripDate(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** A real timestamp, always shown in Nepal time with that made explicit — for deadlines/instants everyone should read the same way regardless of where they are. */
export function formatDateTimeNpt(timestamp: string): string {
  return (
    new Date(timestamp).toLocaleString("en-US", {
      timeZone: "Asia/Kathmandu",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " (Nepal time)"
  );
}

/** "3 hours ago" / "in 2 days" style relative time, from a real timestamp. */
export function formatRelative(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMin = Math.round(diffMs / 60_000);
  const diffHr = Math.round(diffMs / 3_600_000);
  const diffDay = Math.round(diffMs / 86_400_000);
  if (Math.abs(diffMin) < 60) return diffMin >= 0 ? `${diffMin}m ago` : `in ${-diffMin}m`;
  if (Math.abs(diffHr) < 24) return diffHr >= 0 ? `${diffHr}h ago` : `in ${-diffHr}h`;
  return diffDay >= 0 ? `${diffDay}d ago` : `in ${-diffDay}d`;
}

/** Today's date in Nepal, as "YYYY-MM-DD" — for any "today" logic that must agree regardless of the server/viewer's own timezone (e.g. comparing against a departure_date). */
export function todayInNepal(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}
