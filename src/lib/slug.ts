const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True if `value` looks like a UUID (a legacy id-based link) rather than a slug. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
