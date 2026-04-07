import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type VerificationStatus =
  | "unregistered"
  | "pending"
  | "in_review"
  | "verified"
  | "rejected";

export interface AgencyApplication {
  id: string;
  user_id: string;
  company_name: string;
  registration_number: string;
  pan_number: string;
  address: string;
  city: string;
  district: string;
  phone: string;
  email: string;
  website: string;
  owner_name: string;
  owner_phone: string;
  description: string;
  license_url: string;
  pan_url: string;
  insurance_url: string;
  status: VerificationStatus;
  rejection_reason: string;
  created_at: string;
  updated_at: string;
}

interface AgencyStore {
  // Current user's application
  application: AgencyApplication | null;
  verificationStatus: VerificationStatus;
  isLoading: boolean;

  // All applications (admin view)
  allApplications: AgencyApplication[];
  isLoadingAll: boolean;

  // Actions — agency side
  fetchMyApplication: () => Promise<void>;
  submitApplication: (form: {
    companyName: string;
    registrationNumber: string;
    panNumber: string;
    address: string;
    city: string;
    district: string;
    phone: string;
    email: string;
    website: string;
    ownerName: string;
    ownerPhone: string;
    description: string;
    licenseFile: string;
    panFile: string;
    insuranceFile: string;
  }) => Promise<{ error: string | null }>;
  subscribeToMyApplication: () => () => void;

  // Actions — admin side
  fetchAllApplications: () => Promise<void>;
  subscribeToAllApplications: () => () => void;
  updateApplicationStatus: (
    applicationId: string,
    status: VerificationStatus,
    rejectionReason?: string
  ) => Promise<{ error: string | null }>;

  // Reset
  reset: () => void;
}

export const useAgencyStore = create<AgencyStore>((set, get) => ({
  application: null,
  verificationStatus: "unregistered",
  isLoading: false,
  allApplications: [],
  isLoadingAll: false,

  // ── Agency: fetch own application ────────────────────────
  fetchMyApplication: async () => {
    set({ isLoading: true });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      set({ isLoading: false });
      return;
    }

    const { data, error } = await supabase
      .from("agency_applications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching application:", error.message);
      set({ isLoading: false });
      return;
    }

    if (data) {
      set({
        application: data as AgencyApplication,
        verificationStatus: data.status as VerificationStatus,
        isLoading: false,
      });
    } else {
      set({
        application: null,
        verificationStatus: "unregistered",
        isLoading: false,
      });
    }
  },

  // ── Agency: submit application ───────────────────────────
  submitApplication: async (form) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    // Check for existing application
    const { data: existing } = await supabase
      .from("agency_applications")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      // Update existing application (resubmission)
      const { data, error } = await supabase
        .from("agency_applications")
        .update({
          company_name: form.companyName,
          registration_number: form.registrationNumber,
          pan_number: form.panNumber,
          address: form.address,
          city: form.city,
          district: form.district,
          phone: form.phone,
          email: form.email,
          website: form.website,
          owner_name: form.ownerName,
          owner_phone: form.ownerPhone,
          description: form.description,
          license_url: form.licenseFile,
          pan_url: form.panFile,
          insurance_url: form.insuranceFile,
          status: "pending",
          rejection_reason: "",
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) return { error: error.message };
      set({
        application: data as AgencyApplication,
        verificationStatus: "pending",
      });
      return { error: null };
    }

    // Insert new application
    const { data, error } = await supabase
      .from("agency_applications")
      .insert({
        user_id: user.id,
        company_name: form.companyName,
        registration_number: form.registrationNumber,
        pan_number: form.panNumber,
        address: form.address,
        city: form.city,
        district: form.district,
        phone: form.phone,
        email: form.email,
        website: form.website,
        owner_name: form.ownerName,
        owner_phone: form.ownerPhone,
        description: form.description,
        license_url: form.licenseFile,
        pan_url: form.panFile,
        insurance_url: form.insuranceFile,
        status: "pending",
      })
      .select()
      .single();

    if (error) return { error: error.message };
    set({
      application: data as AgencyApplication,
      verificationStatus: "pending",
    });
    return { error: null };
  },

  // ── Agency: real-time subscription for own application ───
  subscribeToMyApplication: () => {
    let channel: RealtimeChannel | null = null;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel("my-agency-application")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "agency_applications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (payload.eventType === "DELETE") {
              set({ application: null, verificationStatus: "unregistered" });
              return;
            }
            const row = payload.new as AgencyApplication;
            set({
              application: row,
              verificationStatus: row.status as VerificationStatus,
            });
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  },

  // ── Admin: fetch all applications ────────────────────────
  fetchAllApplications: async () => {
    set({ isLoadingAll: true });
    const { data, error } = await supabase
      .from("agency_applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching all applications:", error.message);
      set({ isLoadingAll: false });
      return;
    }

    set({ allApplications: (data ?? []) as AgencyApplication[], isLoadingAll: false });
  },

  // ── Admin: real-time subscription for all applications ───
  subscribeToAllApplications: () => {
    const channel = supabase
      .channel("all-agency-applications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agency_applications",
        },
        (payload) => {
          const current = get().allApplications;

          if (payload.eventType === "INSERT") {
            set({ allApplications: [payload.new as AgencyApplication, ...current] });
          } else if (payload.eventType === "UPDATE") {
            set({
              allApplications: current.map((app) =>
                app.id === (payload.new as AgencyApplication).id
                  ? (payload.new as AgencyApplication)
                  : app
              ),
            });
          } else if (payload.eventType === "DELETE") {
            set({
              allApplications: current.filter(
                (app) => app.id !== (payload.old as { id: string }).id
              ),
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // ── Admin: approve / reject ──────────────────────────────
  updateApplicationStatus: async (applicationId, status, rejectionReason = "") => {
    const { error } = await supabase
      .from("agency_applications")
      .update({ status, rejection_reason: rejectionReason })
      .eq("id", applicationId);

    if (error) return { error: error.message };

    // Optimistic update in allApplications
    const current = get().allApplications;
    set({
      allApplications: current.map((app) =>
        app.id === applicationId
          ? { ...app, status, rejection_reason: rejectionReason }
          : app
      ),
    });

    return { error: null };
  },

  reset: () =>
    set({
      application: null,
      verificationStatus: "unregistered",
      allApplications: [],
    }),
}));
