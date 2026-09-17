// Agency application submission — Phase 4. Replaces the old direct
// `supabase.from("agency_applications").insert/update(...)` pattern
// (src/stores/agencyStore.ts) with a service-role function, because the
// new schema splits what used to be one row across three tables
// (agencies, agency_users, agency_verification) that must be created
// atomically and consistently — and because agency_users/agencies have no
// client INSERT policy at all (Phase 2), by design: self-service creation
// of "I am the owner of this agency" is exactly the kind of claim that
// should go through a server-verified path, not a raw table insert a
// client could tamper with (e.g. inserting themselves as owner of an
// agency they don't actually control).
//
// Two actions:
//   save_draft — idempotent; creates the agency+owner membership+draft
//     verification row on first call, or updates the existing draft on
//     subsequent calls. Called early in the onboarding wizard (before
//     document upload) so the frontend has a real agency_id to scope
//     document storage paths to — agency_documents' RLS/storage policies
//     require an existing agency_users membership, which doesn't exist
//     until this has run once.
//   submit — validates required documents exist, updates final field
//     values, and transitions agency_verification.status to "submitted".
//     Works identically for a first-time submission and a resubmission
//     after rejection/more-info-requested (the transition guard trigger
//     allows both "draft"/"rejected"/"more_info_required" -> "submitted").

import { requirePlatformRole, serviceRoleClient, verifyCaller, VerificationError } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";
import { agencyApplicationReceivedEmail } from "../_shared/emailTemplates.ts";
import { logError } from "../_shared/guards.ts";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

interface ApplicationFields {
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

function slugify(name: string): string {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "agency";
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const caller = await verifyCaller(req);
    // Any authenticated user may start an application — becoming "agency"
    // platform role happens only on approval (review-agency-application),
    // not here. No AAL requirement: traveler/agency are not elevated roles.
    requirePlatformRole(caller, ["traveler", "agency"]);

    const supabaseAdmin = serviceRoleClient();
    const body = await req.json() as { action: string; fields?: ApplicationFields };
    const { action, fields } = body;

    // Find the caller's existing agency membership, if any (owner role —
    // an applicant is always the owner of the agency they're applying for).
    const { data: existingMembership } = await supabaseAdmin
      .from("agency_users")
      .select("agency_id")
      .eq("user_id", caller.id)
      .eq("agency_role", "owner")
      .is("removed_at", null)
      .maybeSingle();

    if (action === "save_draft") {
      if (!fields?.companyName?.trim()) return json({ error: "companyName is required" }, 400);

      if (existingMembership) {
        // Update existing draft/rejected/more-info-required agency in place.
        const { error: updateErr } = await supabaseAdmin
          .from("agencies")
          .update({
            legal_name: fields.companyName,
            display_name: fields.companyName,
            description: fields.description ?? "",
            city: fields.city ?? null,
            district: fields.district ?? null,
            address: fields.address ?? null,
            phone: fields.phone ?? null,
            email: fields.email ?? null,
            website: fields.website ?? null,
          })
          .eq("id", existingMembership.agency_id);
        if (updateErr) return json({ error: updateErr.message }, 500);
        return json({ success: true, agency_id: existingMembership.agency_id });
      }

      // First time: create agencies + agency_users(owner) + agency_verification(draft).
      const { data: agency, error: agencyErr } = await supabaseAdmin
        .from("agencies")
        .insert({
          legal_name: fields.companyName,
          display_name: fields.companyName,
          slug: slugify(fields.companyName),
          description: fields.description ?? "",
          city: fields.city ?? null,
          district: fields.district ?? null,
          address: fields.address ?? null,
          phone: fields.phone ?? null,
          email: fields.email ?? null,
          website: fields.website ?? null,
        })
        .select("id")
        .single();
      if (agencyErr || !agency) return json({ error: agencyErr?.message ?? "Failed to create agency" }, 500);

      const { error: memberErr } = await supabaseAdmin
        .from("agency_users")
        .insert({ agency_id: agency.id, user_id: caller.id, agency_role: "owner", accepted_at: new Date().toISOString() });
      if (memberErr) return json({ error: memberErr.message }, 500);

      const { error: verificationErr } = await supabaseAdmin
        .from("agency_verification")
        .insert({ agency_id: agency.id, status: "draft" });
      if (verificationErr) return json({ error: verificationErr.message }, 500);

      return json({ success: true, agency_id: agency.id });
    }

    if (action === "submit") {
      if (!existingMembership) return json({ error: "No application found. Save a draft first." }, 400);
      const agencyId = existingMembership.agency_id;

      if (fields) {
        await supabaseAdmin
          .from("agencies")
          .update({
            legal_name: fields.companyName,
            display_name: fields.companyName,
            description: fields.description ?? "",
            city: fields.city ?? null,
            district: fields.district ?? null,
            address: fields.address ?? null,
            phone: fields.phone ?? null,
            email: fields.email ?? null,
            website: fields.website ?? null,
          })
          .eq("id", agencyId);
      }

      // Require the two mandatory document types to already be uploaded
      // (target §22 flow: Apply -> Submit business details -> Upload
      // documents -> Review). Documents are inserted directly by the
      // client (RLS-protected via has_agency_access, which now works
      // since agency_users exists after save_draft) — this function only
      // verifies they're present, it doesn't re-upload them.
      const { data: docs } = await supabaseAdmin
        .from("agency_documents")
        .select("document_type")
        .eq("agency_id", agencyId);
      // Matches exactly what the onboarding wizard's Step 3 collects as
      // required (src/pages/agency/AgencyOnboarding.tsx) — Tourism License
      // and PAN/VAT Certificate. Registration number itself is a text
      // field (agencies.legal_name/registration data), not a separate
      // uploaded document, so "business_registration" is not required
      // here; it remains a valid document_type for agencies that want to
      // additionally upload one, just not mandatory to submit.
      const types = new Set((docs ?? []).map((d) => d.document_type as string));
      const missing = ["tourism_license", "pan_certificate"].filter((t) => !types.has(t));
      if (missing.length > 0) {
        return json({ error: `Missing required documents: ${missing.join(", ")}` }, 400);
      }

      const { data: verification, error: fetchErr } = await supabaseAdmin
        .from("agency_verification")
        .select("status")
        .eq("agency_id", agencyId)
        .single();
      if (fetchErr || !verification) return json({ error: "Verification record not found" }, 500);
      if (!["draft", "rejected", "more_info_required"].includes(verification.status)) {
        return json({ error: `Cannot submit from status "${verification.status}"` }, 400);
      }

      const { error: submitErr } = await supabaseAdmin
        .from("agency_verification")
        .update({ status: "submitted", submitted_at: new Date().toISOString(), rejection_reason: null, info_requested_note: null })
        .eq("agency_id", agencyId);
      if (submitErr) return json({ error: submitErr.message }, 500);

      const { data: agency } = await supabaseAdmin.from("agencies").select("display_name").eq("id", agencyId).single();
      if (agency && caller.email) {
        const { subject, html, text } = agencyApplicationReceivedEmail({
          agencyName: agency.display_name,
          ownerName: fields?.ownerName ?? caller.email.split("@")[0],
        });
        // sendEmail() returns { error } rather than throwing on a normal
        // delivery failure — check it explicitly rather than relying on
        // .catch(), which would only fire for a genuinely unexpected
        // exception (network-level, etc.), not a provider-reported error.
        const { error: emailErr } = await sendEmail({ to: caller.email, subject, html, text });
        if (emailErr) logError("agency-application: send email", emailErr);
      }

      return json({ success: true, agency_id: agencyId });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    if (err instanceof VerificationError) return json({ error: err.message }, err.status);
    logError("agency-application", err);
    return json({ error: "Internal server error" }, 500);
  }
});
