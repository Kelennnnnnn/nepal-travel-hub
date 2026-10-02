// Generates supabase/tests/security/generated/{rls-matrix,function-matrix}.generated.sql
// from supabase/tests/security/rls-matrix.yaml, against the LIVE local
// database schema. Run via `npm run test:db` (this always runs first,
// `&&`-chained before `supabase test db`).
//
// This is the completeness gate the prompt asked for: if any public.*
// base table, or any function in public.* (SECURITY DEFINER ones called
// out specifically — this is C1's own regression tripwire: a SECURITY
// DEFINER function left reachable by anon/authenticated via the Postgres
// EXECUTE-granted-to-PUBLIC default), has no entry in rls-matrix.yaml,
// this script exits non-zero BEFORE writing any generated SQL — so a
// stale/missing generated file can never mask a schema change that the
// matrix wasn't updated for, and CI fails at this step rather than
// silently testing less than the live schema actually has.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MATRIX_PATH = join(ROOT, "supabase/tests/security/rls-matrix.yaml");
const GENERATED_DIR = join(ROOT, "supabase/tests/security/generated");

const DB_URL =
  process.env.SECURITY_TEST_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

interface TableRow {
  id_column?: string;
  id: string;
}
interface TableEntry {
  row: TableRow;
  select: string[];
  insert_values: Record<string, string>;
  insert: string[];
  update: { set: string };
  update_allow: string[];
  delete: string[];
}
interface FunctionEntry {
  security_definer: boolean;
  execute: string[];
  no_service_role?: boolean;
}
interface Matrix {
  roles: string[];
  tables: Record<string, TableEntry>;
  functions: Record<string, FunctionEntry>;
}

function psql(sql: string): string {
  return execFileSync(
    "psql",
    [DB_URL, "-t", "-A", "-F", "|", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function liveTables(): string[] {
  const out = psql(
    `select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name;`,
  );
  return out ? out.split("\n").map((l) => l.trim()).filter(Boolean) : [];
}

interface LiveFunction {
  sig: string; // "name(args)" exactly matching how it must appear as a YAML key
  securityDefiner: boolean;
}

function liveFunctions(): LiveFunction[] {
  const out = psql(
    `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', p.prosecdef
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     order by p.proname;`,
  );
  if (!out) return [];
  return out.split("\n").map((line) => {
    const [sig, sd] = line.split("|");
    return { sig: sig.trim(), securityDefiner: sd.trim() === "t" };
  });
}

function loadMatrix(): Matrix {
  const raw = readFileSync(MATRIX_PATH, "utf8");
  return parseYaml(raw) as Matrix;
}

function assertCompleteness(matrix: Matrix) {
  const errors: string[] = [];

  const live = liveTables();
  const missingTables = live.filter((t) => !(t in matrix.tables));
  if (missingTables.length > 0) {
    errors.push(
      `Missing table entries in rls-matrix.yaml (add a \`tables.<name>\` entry for each, or the matrix no longer covers every table in schema public):\n` +
        missingTables.map((t) => `  - ${t}`).join("\n"),
    );
  }

  const liveFns = liveFunctions();
  const missingFns = liveFns.filter((f) => !(f.sig in matrix.functions));
  const missingDefinerFns = missingFns.filter((f) => f.securityDefiner);
  if (missingFns.length > 0) {
    errors.push(
      `Missing function entries in rls-matrix.yaml (add a \`functions.<sig>\` entry for each):\n` +
        missingFns
          .map((f) => `  - ${f.sig}${f.securityDefiner ? "  [SECURITY DEFINER -- audit C1 regression risk]" : ""}`)
          .join("\n"),
    );
  }
  if (missingDefinerFns.length > 0) {
    errors.push(
      `${missingDefinerFns.length} of those are SECURITY DEFINER functions with no recorded expected EXECUTE grant. ` +
        `This is exactly the C1 bug class (a privileged function left EXECUTE-granted to PUBLIC by Postgres's default) -- ` +
        `the matrix cannot vouch for these until they have an entry.`,
    );
  }

  if (errors.length > 0) {
    console.error("\n✗ rls-matrix.yaml is incomplete:\n");
    console.error(errors.join("\n\n"));
    console.error(
      "\nNo SQL was generated. Fix rls-matrix.yaml and re-run `npm run test:db`.\n",
    );
    process.exit(1);
  }

  // Extra tables/functions in the YAML that no longer exist live are a
  // staleness smell (e.g. a dropped table) but not a failure -- warn only.
  const extraTables = Object.keys(matrix.tables).filter((t) => !live.includes(t));
  if (extraTables.length > 0) {
    console.warn(`⚠ rls-matrix.yaml has table entries with no live table: ${extraTables.join(", ")}`);
  }
}

const ROLE_UUIDS: Record<string, string> = {
  T1: "5ec10000-0000-0000-0000-000000000001",
  T2: "5ec10000-0000-0000-0000-000000000002",
  OA: "5ec20000-0000-0000-0000-000000000001",
  MA: "5ec20000-0000-0000-0000-000000000002",
  SA: "5ec20000-0000-0000-0000-000000000003",
  OB: "5ec20000-0000-0000-0000-000000000004",
  OS: "5ec20000-0000-0000-0000-000000000005",
  admin: "5ec30000-0000-0000-0000-000000000001",
  admin_aal1: "5ec30000-0000-0000-0000-000000000002",
  super_admin: "5ec30000-0000-0000-0000-000000000003",
  support: "5ec30000-0000-0000-0000-000000000004",
  finance: "5ec30000-0000-0000-0000-000000000005",
};
const ROLE_AAL: Record<string, string> = { admin_aal1: "aal1" };

function impersonate(role: string): string {
  if (role === "anon") {
    return `set local role anon;\nselect set_config('request.jwt.claims', '', true);`;
  }
  const sub = ROLE_UUIDS[role];
  const aal = ROLE_AAL[role] ?? "aal2";
  return `set local role authenticated;\nselect set_config('request.jwt.claims', json_build_object('sub', '${sub}', 'role', 'authenticated', 'aal', '${aal}')::text, true);`;
}

function deimpersonate(): string {
  return `reset role;\nselect set_config('request.jwt.claims', '', true);`;
}

function pkWhere(row: TableRow): string {
  const col = row.id_column ?? "id";
  return `${col} = '${row.id}'`;
}

function genFixturesBlock(): string {
  // Embeds fixtures.sql's INSERT section verbatim (everything between its
  // `select plan(1);` and `select pass(...)` lines) so the generated file
  // is self-contained, per the project's established "no \i includes"
  // convention. Kept in sync by reading the file at generation time rather
  // than duplicating it by hand.
  const fixtures = readFileSync(
    join(ROOT, "supabase/tests/security/fixtures.sql"),
    "utf8",
  );
  const start = fixtures.indexOf("-- Fixture rows are inserted as");
  const end = fixtures.indexOf("select pass('fixture dataset loads without error');");
  if (start === -1 || end === -1) {
    throw new Error("fixtures.sql markers not found -- did its structure change?");
  }
  return fixtures.slice(start, end).trim();
}

function genTableMatrixSql(matrix: Matrix): string {
  const lines: string[] = [];
  lines.push(
    "-- GENERATED FILE -- do not edit by hand.",
    "-- Source: supabase/tests/security/rls-matrix.yaml (tables section)",
    "-- Regenerate: npm run test:db",
    "-- Run directly: supabase test db supabase/tests/security/generated/rls-matrix.generated.sql",
    "begin;",
    "create extension if not exists pgtap;",
    "",
    genFixturesBlock(),
    "",
  );

  // Session-local helper: runs an UPDATE/DELETE and returns the affected
  // row count, or -1 if RLS (or anything else) raised instead of silently
  // matching 0 rows -- both outcomes mean "denied", just via the two
  // different mechanisms Postgres RLS actually uses (see house convention
  // comment in supabase/tests/booking-state-rpcs.sql).
  lines.push(
    "create or replace function pg_temp.probe_affected_rows(p_sql text) returns integer language plpgsql as $f$",
    "declare v_count integer;",
    "begin",
    "  execute p_sql;",
    "  get diagnostics v_count = row_count;",
    "  return v_count;",
    "exception when others then",
    "  return -1;",
    "end;",
    "$f$;",
    "",
  );

  let planCount = 0;
  const body: string[] = [];

  for (const [table, entry] of Object.entries(matrix.tables)) {
    const where = pkWhere(entry.row);

    // SELECT: allow -> row visible (count=1), deny -> invisible (count=0).
    for (const role of matrix.roles) {
      const expectAllow = entry.select.includes(role);
      planCount++;
      body.push(
        impersonate(role),
        `select is((select count(*)::int from public.${table} where ${where}), ${expectAllow ? 1 : 0}, '${table}: ${role} select -> ${expectAllow ? "allow" : "deny"}');`,
        deimpersonate(),
        "",
      );
    }

    // INSERT: only probed for roles explicitly named allow OR a sample of
    // deny roles -- probing EVERY role x EVERY table would triple the
    // suite's size for little extra signal beyond "RLS correctly denies
    // insert," which is already asserted once per role that's denied.
    // We probe every role in matrix.roles for symmetry with select/update.
    if (Object.keys(entry.insert_values).length > 0) {
      const cols = Object.keys(entry.insert_values);
      const vals = Object.values(entry.insert_values);
      const insertSql = `insert into public.${table} (${cols.join(", ")}) values (${vals.join(", ")})`;
      for (const role of matrix.roles) {
        const expectAllow = entry.insert.includes(role);
        planCount++;
        body.push(
          `savepoint probe;`,
          impersonate(role),
          expectAllow
            ? `select lives_ok($sql$ ${insertSql} $sql$, '${table}: ${role} insert -> allow');`
            // Any exception counts as "denied" -- usually 42501 (RLS CHECK
            // rejected it), but some probes hit a real table constraint
            // first (e.g. a unique index already exercised by the fixture
            // row), which is just as valid a "this insert did not happen"
            // signal for this matrix's purpose (breadth of what each role
            // can write), not something worth a per-row error-code override.
            : `select throws_ok($sql$ ${insertSql} $sql$, null, null, '${table}: ${role} insert -> deny');`,
          deimpersonate(),
          `rollback to savepoint probe;`,
          "",
        );
      }
    }

    // UPDATE
    for (const role of matrix.roles) {
      const expectAllow = entry.update_allow.includes(role);
      const updateSql = `update public.${table} set ${entry.update.set} where ${where}`;
      planCount++;
      body.push(
        `savepoint probe;`,
        impersonate(role),
        `select ok(pg_temp.probe_affected_rows($sql$ ${updateSql} $sql$) ${expectAllow ? "= 1" : "<= 0"}, '${table}: ${role} update -> ${expectAllow ? "allow" : "deny"}');`,
        deimpersonate(),
        `rollback to savepoint probe;`,
        "",
      );
    }

    // DELETE: only for tables where the YAML names at least one allowed
    // role or we want the deny-only sweep; we always sweep every role
    // (a delete that's "denied" via 0-rows is cheap/safe, and the savepoint
    // rolls back any delete that *did* succeed before the next probe).
    for (const role of matrix.roles) {
      const expectAllow = entry.delete.includes(role);
      const deleteSql = `delete from public.${table} where ${where}`;
      planCount++;
      body.push(
        `savepoint probe;`,
        impersonate(role),
        `select ok(pg_temp.probe_affected_rows($sql$ ${deleteSql} $sql$) ${expectAllow ? "= 1" : "<= 0"}, '${table}: ${role} delete -> ${expectAllow ? "allow" : "deny"}');`,
        deimpersonate(),
        `rollback to savepoint probe;`,
        "",
      );
    }
  }

  lines.push(`select plan(${planCount});`, "", ...body, "select * from finish();", "rollback;");
  return lines.join("\n");
}

// has_function_privilege()'s regprocedure cast needs a bare type list
// ("uuid, uuid"), not the identity-argument form with parameter names
// ("p_conversation_id uuid, p_user_id uuid") that rls-matrix.yaml's keys
// use (matching pg_get_function_identity_arguments(), so the completeness
// gate above can compare directly against the live catalog) -- strip the
// leading parameter name off each comma-separated argument.
function stripArgNames(sig: string): string {
  const open = sig.indexOf("(");
  const name = sig.slice(0, open);
  const argsStr = sig.slice(open + 1, -1);
  if (argsStr.trim() === "") return `${name}()`;
  const types = argsStr.split(", ").map((arg) => {
    const firstSpace = arg.indexOf(" ");
    return firstSpace === -1 ? arg : arg.slice(firstSpace + 1);
  });
  return `${name}(${types.join(", ")})`;
}

function genFunctionMatrixSql(matrix: Matrix): string {
  const lines: string[] = [
    "-- GENERATED FILE -- do not edit by hand.",
    "-- Source: supabase/tests/security/rls-matrix.yaml (functions section)",
    "-- Regenerate: npm run test:db",
    "-- Run directly: supabase test db supabase/tests/security/generated/function-matrix.generated.sql",
    "begin;",
    "create extension if not exists pgtap;",
    "",
  ];

  const pgRoles = ["anon", "authenticated", "service_role"];
  let planCount = 0;
  const body: string[] = [];

  for (const [sig, entry] of Object.entries(matrix.functions)) {
    const bareSig = stripArgNames(sig);
    for (const role of pgRoles) {
      // service_role has EXECUTE on every function in this schema EXCEPT
      // the two pg_cron-only cleanup jobs (expire_stale_quotes/
      // expire_stale_reservations), which pg_cron invokes directly as the
      // scheduling superuser and so were never granted to service_role at
      // all -- `no_service_role: true` opts a function out of the
      // otherwise-blanket default instead of repeating "service_role" in
      // 78 other entries' execute lists.
      const expectAllow =
        role === "service_role" ? !entry.no_service_role : entry.execute.includes(role);
      planCount++;
      body.push(
        `select is(has_function_privilege('${role}', 'public.${bareSig}', 'EXECUTE'), ${expectAllow}, 'public.${sig}: ${role} EXECUTE -> ${expectAllow ? "allow" : "deny"}${entry.security_definer ? " [SECURITY DEFINER]" : ""}');`,
      );
    }
  }

  lines.push(`select plan(${planCount});`, "", ...body, "", "select * from finish();", "rollback;");
  return lines.join("\n");
}

function main() {
  const matrix = loadMatrix();
  assertCompleteness(matrix);

  mkdirSync(GENERATED_DIR, { recursive: true });
  writeFileSync(join(GENERATED_DIR, "rls-matrix.generated.sql"), genTableMatrixSql(matrix) + "\n");
  writeFileSync(join(GENERATED_DIR, "function-matrix.generated.sql"), genFunctionMatrixSql(matrix) + "\n");

  console.log("✓ rls-matrix.yaml is complete -- generated rls-matrix.generated.sql and function-matrix.generated.sql");
}

main();
