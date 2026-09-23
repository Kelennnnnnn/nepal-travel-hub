// Fixes audit C1 — regression probe.
//
// Calls every function audit C1's migration (20260917000005_lockdown_
// definer_functions.sql) locks down to service_role, using ONLY the
// browser-visible anon key (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY —
// the same two env vars src/lib/supabase.ts uses), exactly the way a
// malicious or merely curious visitor could from the browser console via
// supabase.rpc(...). Every call must fail with a permission-denied error
// (Postgres 42501, surfaced by PostgREST as a 42501-coded response). If any
// call SUCCEEDS, or fails for a different reason (e.g. a signature/argument
// mismatch masking the real grant state), this script exits non-zero — the
// point is to catch a future migration accidentally re-opening one of
// these, not just to prove today's migration worked once.
//
// Run against local dev by default; point VITE_SUPABASE_URL at a deployed
// project (with its own anon key) to probe that environment instead.

import { createClient } from "@supabase/supabase-js";

const LOCKED_DOWN_RPCS: { name: string; args: Record<string, unknown> }[] = [
  {
    name: "hold_inventory",
    args: { p_departure_id: "00000000-0000-0000-0000-000000000000", p_quantity: 1, p_ttl_minutes: 15 },
  },
  {
    name: "confirm_reservation",
    args: { p_reservation_id: "00000000-0000-0000-0000-000000000000", p_booking_id: "00000000-0000-0000-0000-000000000000" },
  },
  {
    name: "release_reservation",
    args: { p_reservation_id: "00000000-0000-0000-0000-000000000000", p_reason: "released" },
  },
  {
    name: "record_booking_event",
    args: { p_booking_id: "00000000-0000-0000-0000-000000000000", p_event_type: "PROBE", p_metadata: {} },
  },
  {
    name: "record_audit_log",
    args: {
      p_actor_id: "00000000-0000-0000-0000-000000000000",
      p_action: "PROBE",
      p_resource_type: "probe",
      p_resource_id: "probe",
      p_before: null,
      p_after: null,
      p_request_id: null,
    },
  },
];

const PERMISSION_DENIED_CODE = "42501";

async function main() {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in the environment.");
    console.error("Run with: node --env-file=.env.local -r tsx/cjs scripts/anon-rpc-probe.ts (see npm script)");
    process.exit(2);
  }

  const supabase = createClient(url, anonKey, { auth: { persistSession: false } });

  let failures = 0;

  for (const rpc of LOCKED_DOWN_RPCS) {
    const { error } = await supabase.rpc(rpc.name, rpc.args);

    if (!error) {
      console.error(`FAIL  ${rpc.name}: call succeeded as anon — should be permission denied.`);
      failures++;
      continue;
    }

    if (error.code !== PERMISSION_DENIED_CODE) {
      console.error(
        `FAIL  ${rpc.name}: expected ${PERMISSION_DENIED_CODE} (permission denied), got code=${error.code ?? "?"} message="${error.message}".`
      );
      failures++;
      continue;
    }

    console.log(`OK    ${rpc.name}: permission denied (${error.code}), as expected.`);
  }

  if (failures > 0) {
    console.error(`\n${failures}/${LOCKED_DOWN_RPCS.length} RPC(s) are NOT properly locked down.`);
    process.exit(1);
  }

  console.log(`\nAll ${LOCKED_DOWN_RPCS.length} audit C1 RPCs correctly reject anon calls.`);
}

main().catch((err) => {
  console.error("anon-rpc-probe crashed:", err);
  process.exit(1);
});
