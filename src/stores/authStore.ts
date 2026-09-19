import { create } from "zustand";
import { supabase } from "@/lib/supabase";

// Platform-wide role (target §28) — lives ONLY in auth.users.app_metadata,
// never user_metadata (client-editable, never trusted for authorization —
// AUDIT_REPORT.md AUTH-07/RLS-02, fixed structurally in the Phase 2 schema).
// "traveler" replaces the old system's "user" to match the target vocabulary
// exactly (and the Phase 2 DB default — supabase/migrations/20260916000002_
// identity.sql's set_default_role_on_signup() already writes "traveler").
export type Role = "traveler" | "agency" | "admin" | "super_admin" | "support" | "finance";

/** Roles that require MFA (aal2) before they can do anything — mirrors the
 *  is_admin()/is_finance_or_admin()/is_support_or_admin() Postgres
 *  functions and requirePlatformRole() in the edge functions exactly
 *  (PHASE_3_AUTH.md — all three must stay in sync by hand). */
export const ELEVATED_ROLES: Role[] = ["admin", "super_admin", "support", "finance"];

export type AuthAssuranceLevel = "aal1" | "aal2";

export interface AgencyMembership {
  agencyId: string;
  agencyRole: "owner" | "manager" | "staff";
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  aal: AuthAssuranceLevel;
  /** Empty for travelers/admins; populated for `role: "agency"` accounts.
   *  A user can belong to more than one agency (rare, but the schema
   *  allows it — e.g. a consultant staffing two agencies). */
  agencyMemberships: AgencyMembership[];
  /** True once an elevated-role account has at least one verified TOTP
   *  factor enrolled — distinct from `aal`, which reflects the CURRENT
   *  session, not whether enrollment has ever happened. Used to decide
   *  "send them to /admin/mfa-setup" vs "send them to /admin/mfa-verify". */
  hasVerifiedMfaFactor: boolean;
  initialize: () => () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null; role?: Role }>;
  signUp: (params: {
    name: string;
    email: string;
    password: string;
  }) => Promise<{ error: string | null; requiresConfirmation: boolean }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  /** Re-reads MFA factor/AAL state from Supabase — call after a successful
   *  mfa.enroll()/mfa.verify() so the store reflects the new session
   *  immediately rather than waiting for the next auth event. */
  refreshMfaState: () => Promise<void>;
}

/** Decodes the `aal` claim from a Supabase session's access token. Supabase
 *  also exposes `auth.mfa.getAuthenticatorAssuranceLevel()`, which is
 *  preferred where available (it also returns nextLevel/methods) — this
 *  raw decode is the fallback used inside onAuthStateChange, where we
 *  already have the session/token in hand and don't want an extra round
 *  trip on every single auth event. */
function decodeAal(accessToken: string | undefined): AuthAssuranceLevel {
  if (!accessToken) return "aal1";
  try {
    const payload = accessToken.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json.aal === "aal2" ? "aal2" : "aal1";
  } catch {
    return "aal1";
  }
}

async function fetchAgencyMemberships(userId: string): Promise<AgencyMembership[]> {
  const { data, error } = await supabase
    .from("agency_users")
    .select("agency_id, agency_role")
    .eq("user_id", userId)
    .is("removed_at", null);
  if (error || !data) return [];
  return data.map((row) => ({ agencyId: row.agency_id as string, agencyRole: row.agency_role as AgencyMembership["agencyRole"] }));
}

async function fetchHasVerifiedMfaFactor(): Promise<boolean> {
  const { data } = await supabase.auth.mfa.listFactors();
  return !!data?.totp?.some((f) => f.status === "verified");
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  aal: "aal1",
  agencyMemberships: [],
  hasVerifiedMfaFactor: false,

  initialize: () => {
    const buildUser = (authUser: { id: string; email?: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }): User => {
      const meta  = authUser.user_metadata ?? {};
      const email = authUser.email ?? "";
      return {
        id: authUser.id,
        name: (meta.full_name ?? meta.name ?? email.split("@")[0]) as string,
        email,
        // Role lives in app_metadata (server-only) — never user_metadata.
        role: ((authUser.app_metadata?.role as Role) ?? "traveler"),
      };
    };

    const applySession = async (session: { user: Parameters<typeof buildUser>[0]; access_token: string } | null) => {
      if (!session?.user) {
        set({ user: null, isAuthenticated: false, isLoading: false, aal: "aal1", agencyMemberships: [], hasVerifiedMfaFactor: false });
        return;
      }
      const user = buildUser(session.user);
      const aal = decodeAal(session.access_token);
      const [agencyMemberships, hasVerifiedMfaFactor] = await Promise.all([
        user.role === "agency" ? fetchAgencyMemberships(user.id) : Promise.resolve([]),
        ELEVATED_ROLES.includes(user.role) ? fetchHasVerifiedMfaFactor() : Promise.resolve(false),
      ]);
      set({ user, isAuthenticated: true, isLoading: false, aal, agencyMemberships, hasVerifiedMfaFactor });
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      void applySession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION is handled exclusively by getSession() above.
      // On mobile, INITIAL_SESSION can fire with session=null while an expired
      // JWT is still being refreshed over the network. If we act on that null
      // here we set isLoading:false with no user, causing ProtectedRoute to
      // redirect admins to /admin/login before the real session arrives.
      if (event === "INITIAL_SESSION") return;

      // MFA_CHALLENGE_VERIFIED fires the moment mfa.verify() succeeds — the
      // session's aal claim is aal2 from this point on. Re-applying the
      // session here (rather than only in refreshMfaState()) means
      // ProtectedRoute sees the elevated AAL immediately even if the
      // component that called mfa.verify() doesn't itself call
      // refreshMfaState().
      void applySession(session as Parameters<typeof applySession>[0]);
      // (A browser-side "fire the welcome email on confirmation" fallback
      // used to live here, gated on an event name — "EMAIL_CONFIRMED" —
      // that supabase-js never actually emits; removed as dead code. The
      // DB trigger (pg_net) remains the real delivery path for this email.)
    });

    return () => subscription.unsubscribe();
  },

  refreshMfaState: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const hasVerifiedMfaFactor = await fetchHasVerifiedMfaFactor();
    set({ aal: decodeAal(session?.access_token), hasVerifiedMfaFactor });
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
        return { error: "Incorrect email or password. If you just signed up, please confirm your email first." };
      }
      if (msg.includes("email not confirmed")) {
        return { error: "Please confirm your email address before signing in. Check your inbox." };
      }
      return { error: error.message };
    }

    const meta = data.user.user_metadata;
    const role: Role = (data.user.app_metadata?.role as Role) ?? "traveler";
    const aal = decodeAal(data.session?.access_token);
    const [agencyMemberships, hasVerifiedMfaFactor] = await Promise.all([
      role === "agency" ? fetchAgencyMemberships(data.user.id) : Promise.resolve([]),
      ELEVATED_ROLES.includes(role) ? fetchHasVerifiedMfaFactor() : Promise.resolve(false),
    ]);

    set({
      user: { id: data.user.id, name: meta?.full_name ?? meta?.name ?? email.split("@")[0], email, role },
      isAuthenticated: true,
      aal,
      agencyMemberships,
      hasVerifiedMfaFactor,
    });

    return { error: null, role };
  },

  signUp: async ({ name, email, password }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("already been registered")) {
        return {
          error: "This email is already registered. Please sign in instead, or use a different email.",
          requiresConfirmation: false,
        };
      }
      return { error: error.message, requiresConfirmation: false };
    }
    if (!data.user) return { error: "Sign up failed. Please try again.", requiresConfirmation: false };

    const requiresConfirmation = !data.session;

    if (data.session) {
      // New accounts always start as "traveler" (enforced server-side by
      // set_default_role_on_signup() regardless of what's sent here) —
      // becoming an agency happens through the dedicated application flow
      // (Phase 4), not by passing a role/agency name at signup time.
      set({
        user: { id: data.user.id, name, email, role: "traveler" },
        isAuthenticated: true,
        aal: "aal1",
        agencyMemberships: [],
        hasVerifiedMfaFactor: false,
      });
    }

    return { error: null, requiresConfirmation };
  },

  signInWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: { prompt: "select_account" },
      },
    });
    return { error: error?.message ?? null };
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null, isAuthenticated: false, aal: "aal1", agencyMemberships: [], hasVerifiedMfaFactor: false });
  },
}));

/** True if the current session satisfies the auth requirements for `role`:
 *  authenticated, and — for elevated roles — at aal2. Use this instead of
 *  re-deriving the ELEVATED_ROLES check ad hoc in components. */
export function isFullyAuthorizedForRole(role: Role | undefined, aal: AuthAssuranceLevel): boolean {
  if (!role) return false;
  if (!ELEVATED_ROLES.includes(role)) return true;
  return aal === "aal2";
}
