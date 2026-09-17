import { supabase } from "./supabase";
import { logger } from "./logger";

/**
 * Records an admin-panel action to the audit trail.
 *
 * Phase 2 deliberately revoked INSERT on `audit_logs` from every client
 * role — audit trails must never be directly writable by an authenticated
 * browser session (a compromised or malicious client could otherwise forge
 * or simply omit entries). This now goes through the `record-audit-log`
 * edge function, which re-verifies the caller server-side and attributes
 * the entry to their own id — never trusting a client-supplied actor.
 * Fire-and-forget by design (matches the old signature/call sites), but
 * failures are logged instead of silently swallowed, since a failed audit
 * write is itself worth knowing about.
 */
export async function logAdminAction(
  action: string,
  resourceType: string,
  resourceId?: string,
  after?: Record<string, unknown>,
  before?: Record<string, unknown>,
) {
  const { data, error } = await supabase.functions.invoke("record-audit-log", {
    body: { action, resource_type: resourceType, resource_id: resourceId, before, after },
  });
  if (error || data?.error) {
    logger.error("logAdminAction failed:", error?.message ?? data?.error);
  }
}
