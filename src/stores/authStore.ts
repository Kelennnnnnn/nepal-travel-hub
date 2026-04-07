import { create } from "zustand";
import { supabase } from "@/lib/supabase";

export type Role = "user" | "admin" | "agency";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  agencyName?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  initialize: () => () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null; role?: Role }>;
  signUp: (params: {
    name: string;
    email: string;
    password: string;
    role: Role;
    agencyName?: string;
  }) => Promise<{ error: string | null; requiresConfirmation: boolean }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
}


export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: () => {
    const buildUser = (authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => {
      const meta = authUser.user_metadata ?? {};
      const email = authUser.email ?? "";
      return {
        id: authUser.id,
        name: (meta.name ?? meta.full_name ?? email.split("@")[0]) as string,
        email,
        role: ((meta.role as Role) ?? "user") as Role,
        agencyName: meta.agency_name as string | undefined,
      };
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        set({ user: buildUser(session.user), isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        set({ user: buildUser(session.user), isAuthenticated: true, isLoading: false });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    });

    return () => subscription.unsubscribe();
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

    // Read role directly from auth metadata — no DB query, no hang
    const meta = data.user.user_metadata;
    const role: Role = (meta?.role as Role) ?? "user";

    set({
      user: {
        id: data.user.id,
        name: meta?.name ?? meta?.full_name ?? email.split("@")[0],
        email,
        role,
        agencyName: meta?.agency_name ?? undefined,
      },
      isAuthenticated: true,
    });

    return { error: null, role };
  },

  signUp: async ({ name, email, password, role, agencyName }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role, agency_name: agencyName ?? null },
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
      set({
        user: { id: data.user.id, name, email, role, agencyName },
        isAuthenticated: true,
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
    set({ user: null, isAuthenticated: false });
  },
}));
