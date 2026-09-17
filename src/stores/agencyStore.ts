import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import type { RealtimeChannel } from "@supabase/supabase-js";

// PHASE_4_AGENCY_ONBOARDING.md. Rebuilt against the Phase 2 schema, which
// splits what used to be one `agency_applications` row into three tables:
// `agencies` (business entity), `agency_verification` (current status),
// `agency_documents` (one row per document). This store is still Zustand
// (not migrated to TanStack Query — that's a separate, broader refactor
// flagged in PHASE_0_FORENSIC_AUDIT.md FE-03/AUDIT_REPORT.md FE-04 and
// deliberately out of scope here) but its internals are entirely new.

export type VerificationStatus =
  | "unregistered"
  | "draft"
  | "submitted"
  | "in_review"
  | "more_info_required"
  | "approved"
  | "suspended"
  | "rejected";

export interface Agency {
  id: string;
  legal_name: string;
  display_name: string;
  slug: string;
  description: string;
  city: string | null;
  district: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgencyVerification {
  id: string;
  agency_id: string;
  status: VerificationStatus;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  info_requested_note: string | null;
  updated_at: string;
}

export type AgencyDocumentType = "business_registration" | "tourism_license" | "pan_certificate" | "insurance" | "other";

export interface AgencyDocument {
  id: string;
  agency_id: string;
  document_type: AgencyDocumentType;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  status: "pending" | "approved" | "rejected" | "expired";
  created_at: string;
}

export interface AgencyListItem {
  agency: Agency;
  verification: AgencyVerification;
}

export interface ApplicationFields {
  companyName: string;
  registrationNumber?: string;
  panNumber?: string;
  address?: string;
  city?: string;
  district?: string;
  phone?: string;
  email?: string;
  website?: string;
  ownerName?: string;
  ownerPhone?: string;
  description?: string;
}

async function invokeFn(name: string, body: Record<string, unknown>): Promise<{ data: unknown; error: string | null }> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) return { data: null, error: error.message };
  if (data?.error) return { data: null, error: data.error as string };
  return { data, error: null };
}

interface AgencyStore {
  // Current user's application
  myAgency: Agency | null;
  myVerification: AgencyVerification | null;
  myDocuments: AgencyDocument[];
  verificationStatus: VerificationStatus;
  isLoading: boolean;

  // Admin view
  allAgencies: AgencyListItem[];
  isLoadingAll: boolean;

  // Applicant actions
  fetchMyApplication: () => Promise<void>;
  saveDraft: (fields: ApplicationFields) => Promise<{ error: string | null; agencyId?: string }>;
  uploadDocument: (agencyId: string, documentType: AgencyDocumentType, file: File) => Promise<{ error: string | null }>;
  submitApplication: (fields: ApplicationFields) => Promise<{ error: string | null }>;
  subscribeToMyApplication: () => () => void;

  // Admin actions
  fetchAllAgencies: () => Promise<void>;
  subscribeToAllAgencies: () => () => void;
  fetchAgencyDocuments: (agencyId: string) => Promise<AgencyDocument[]>;
  reviewAction: (
    agencyId: string,
    action: "start_review" | "request_info" | "approve" | "reject" | "suspend" | "reinstate",
    extra?: { reason?: string; note?: string },
  ) => Promise<{ error: string | null }>;

  reset: () => void;
}

export const useAgencyStore = create<AgencyStore>((set, get) => ({
  myAgency: null,
  myVerification: null,
  myDocuments: [],
  verificationStatus: "unregistered",
  isLoading: true,
  allAgencies: [],
  isLoadingAll: false,

  // ── Applicant: fetch own application ─────────────────────────────────
  fetchMyApplication: async () => {
    set({ isLoading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { set({ isLoading: false }); return; }

    const { data: membership } = await supabase
      .from("agency_users")
      .select("agency_id")
      .eq("user_id", user.id)
      .eq("agency_role", "owner")
      .is("removed_at", null)
      .maybeSingle();

    if (!membership) {
      set({ myAgency: null, myVerification: null, myDocuments: [], verificationStatus: "unregistered", isLoading: false });
      return;
    }

    const [agencyRes, verificationRes, documentsRes] = await Promise.all([
      supabase.from("agencies").select("*").eq("id", membership.agency_id).single(),
      supabase.from("agency_verification").select("*").eq("agency_id", membership.agency_id).single(),
      supabase.from("agency_documents").select("*").eq("agency_id", membership.agency_id),
    ]);

    if (agencyRes.error || verificationRes.error) {
      logger.error("Error fetching agency application:", agencyRes.error?.message ?? verificationRes.error?.message);
      set({ isLoading: false });
      return;
    }

    set({
      myAgency: agencyRes.data as Agency,
      myVerification: verificationRes.data as AgencyVerification,
      myDocuments: (documentsRes.data ?? []) as AgencyDocument[],
      verificationStatus: (verificationRes.data as AgencyVerification).status,
      isLoading: false,
    });
  },

  // ── Applicant: save draft (idempotent — create or update) ───────────
  saveDraft: async (fields) => {
    const { data, error } = await invokeFn("agency-application", { action: "save_draft", fields });
    if (error) return { error };
    const agencyId = (data as { agency_id: string }).agency_id;
    await get().fetchMyApplication();
    return { error: null, agencyId };
  },

  // ── Applicant: upload a document (direct client upload — RLS-protected
  //    via has_agency_access, which works once saveDraft has run once) ──
  uploadDocument: async (agencyId, documentType, file) => {
    if (file.size > 5 * 1024 * 1024) return { error: "File must be under 5MB" };
    const allowedMime = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedMime.includes(file.type)) return { error: "File must be a PDF, JPG, or PNG" };

    const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    const storagePath = `${agencyId}/${documentType}-${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage.from("agency-documents").upload(storagePath, file, { upsert: true });
    if (uploadErr) return { error: uploadErr.message };

    // Replace any prior row of the same document_type for this agency —
    // an agency should have at most one current file per document type.
    await supabase.from("agency_documents").delete().eq("agency_id", agencyId).eq("document_type", documentType);
    const { error: insertErr } = await supabase.from("agency_documents").insert({
      agency_id: agencyId, document_type: documentType, storage_path: storagePath, mime_type: file.type, size_bytes: file.size,
    });
    if (insertErr) return { error: insertErr.message };

    await get().fetchMyApplication();
    return { error: null };
  },

  // ── Applicant: final submit ──────────────────────────────────────────
  submitApplication: async (fields) => {
    const { error } = await invokeFn("agency-application", { action: "submit", fields });
    if (error) return { error };
    await get().fetchMyApplication();
    return { error: null };
  },

  // ── Applicant: real-time subscription for own application ───────────
  subscribeToMyApplication: () => {
    let channel: RealtimeChannel | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: membership } = await supabase
        .from("agency_users").select("agency_id").eq("user_id", user.id).eq("agency_role", "owner").is("removed_at", null).maybeSingle();
      if (!membership) return;

      channel = supabase
        .channel("my-agency-verification")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "agency_verification", filter: `agency_id=eq.${membership.agency_id}` },
          (payload) => {
            if (payload.eventType === "DELETE") return;
            const row = payload.new as AgencyVerification;
            set({ myVerification: row, verificationStatus: row.status });
          },
        )
        .subscribe();
    })();

    return () => { if (channel) supabase.removeChannel(channel); };
  },

  // ── Admin: fetch all agencies + their verification status ───────────
  fetchAllAgencies: async () => {
    set({ isLoadingAll: true });
    const [agenciesRes, verificationsRes] = await Promise.all([
      supabase.from("agencies").select("*").order("created_at", { ascending: false }),
      supabase.from("agency_verification").select("*"),
    ]);
    if (agenciesRes.error || verificationsRes.error) {
      logger.error("Error fetching all agencies:", agenciesRes.error?.message ?? verificationsRes.error?.message);
      set({ isLoadingAll: false });
      return;
    }
    const verificationByAgency = new Map((verificationsRes.data ?? []).map((v) => [v.agency_id as string, v as AgencyVerification]));
    const list: AgencyListItem[] = (agenciesRes.data ?? [])
      .map((a) => ({ agency: a as Agency, verification: verificationByAgency.get((a as Agency).id) }))
      .filter((x): x is AgencyListItem => !!x.verification);
    set({ allAgencies: list, isLoadingAll: false });
  },

  // ── Admin: real-time subscription for all agency_verification rows ──
  subscribeToAllAgencies: () => {
    const channel = supabase
      .channel("all-agency-verification")
      .on("postgres_changes", { event: "*", schema: "public", table: "agency_verification" }, (payload) => {
        const current = get().allAgencies;
        if (payload.eventType === "UPDATE") {
          const row = payload.new as AgencyVerification;
          set({ allAgencies: current.map((item) => (item.agency.id === row.agency_id ? { ...item, verification: row } : item)) });
        }
        // INSERT/DELETE on agency_verification are rare (one row per
        // agency, created once by agency-application) — a full refetch on
        // those is simpler and cheap enough not to special-case here.
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  },

  // ── Admin: fetch documents for one agency (detail dialog) ───────────
  fetchAgencyDocuments: async (agencyId) => {
    const { data, error } = await supabase.from("agency_documents").select("*").eq("agency_id", agencyId);
    if (error) { logger.error("Error fetching agency documents:", error.message); return []; }
    return (data ?? []) as AgencyDocument[];
  },

  // ── Admin: review actions ────────────────────────────────────────────
  reviewAction: async (agencyId, action, extra) => {
    const { error } = await invokeFn("review-agency-application", { action, agency_id: agencyId, ...extra });
    if (error) return { error };
    await get().fetchAllAgencies();
    return { error: null };
  },

  reset: () => set({ myAgency: null, myVerification: null, myDocuments: [], verificationStatus: "unregistered", allAgencies: [] }),
}));
