// Zod request-body schemas for every edge function action. Centralized
// here (rather than one-off inline per function) so the limits themselves
// — the actual security-relevant numbers — are defined once. Composed
// from a small set of shared primitives matching this hardening pass'
// stated limits: UUIDs are uuid(), reasons/notes <= 2000 chars, names
// <= 150, emails .email().max(254), URLs must be http(s).

import { z } from "zod";

export const uuidField = z.string().uuid();
export const nameField = z.string().trim().min(1).max(150);
export const reasonField = z.string().trim().min(1).max(2000);
export const emailField = z.string().trim().email().max(254);
export const urlField = z.string().trim().url().refine((v) => /^https?:\/\//i.test(v), {
  message: "URL must start with http:// or https://",
});

// ── agency-application ──────────────────────────────────────────────────

const applicationFields = z.object({
  companyName: nameField,
  registrationNumber: z.string().trim().max(150).optional(),
  panNumber: z.string().trim().max(150).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  district: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  email: emailField.optional(),
  website: urlField.optional().or(z.literal("")),
  ownerName: nameField.optional(),
  ownerPhone: z.string().trim().max(30).optional(),
  description: z.string().trim().max(5000).optional(),
});

export const agencyApplicationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_draft"), fields: applicationFields }),
  z.object({ action: z.literal("submit"), fields: applicationFields.optional() }),
]);

// ── review-agency-application ───────────────────────────────────────────

export const reviewAgencyApplicationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start_review"), agency_id: uuidField }),
  z.object({ action: z.literal("request_info"), agency_id: uuidField, note: reasonField }),
  z.object({ action: z.literal("approve"), agency_id: uuidField }),
  z.object({ action: z.literal("reject"), agency_id: uuidField, reason: reasonField }),
  z.object({ action: z.literal("suspend"), agency_id: uuidField, reason: reasonField }),
  z.object({ action: z.literal("reinstate"), agency_id: uuidField }),
]);

// ── admin-users ──────────────────────────────────────────────────────────

const PLATFORM_ROLES = ["traveler", "agency", "admin", "super_admin", "support", "finance"] as const;

export const adminUsersSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("list"),
    search: z.string().trim().max(150).optional(),
    role: z.enum(PLATFORM_ROLES).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
  }),
  z.object({ action: z.literal("suspend"), user_id: uuidField }),
  z.object({ action: z.literal("unsuspend"), user_id: uuidField }),
  z.object({ action: z.literal("change_role"), user_id: uuidField, role: z.enum(PLATFORM_ROLES) }),
  z.object({ action: z.literal("delete"), user_id: uuidField }),
]);

// ── record-audit-log ─────────────────────────────────────────────────────

export const recordAuditLogSchema = z.object({
  action: z.string().trim().min(1).max(150),
  resource_type: z.string().trim().min(1).max(100),
  resource_id: z.string().trim().max(150).optional(),
  before: z.record(z.string(), z.unknown()).optional(),
  after: z.record(z.string(), z.unknown()).optional(),
});

// ── contact-form ──────────────────────────────────────────────────────────
// Audit M2's own explicit limits — deliberately separate from the general
// nameField/emailField primitives above (name<=100 here vs. <=150
// elsewhere), matching the prompt's stated numbers exactly rather than
// reusing a close-but-different shared field.

export const contactFormSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailField,
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(10).max(5000),
  turnstileToken: z.string().trim().min(1).max(4096),
});

// ── delete-account ───────────────────────────────────────────────────────
// No request body fields at all — the caller is entirely identified by
// their bearer token. An empty object schema still rejects genuinely
// malformed JSON (parseJson's job), while allowing `{}` or a body-less
// call, matching how the frontend already calls this.

export const deleteAccountSchema = z.object({}).passthrough();

// ── send-welcome-email ───────────────────────────────────────────────────
// User-JWT-only now (the service-role path was removed — nothing
// legitimate ever called it that way) — the caller is entirely identified
// by their bearer token, so there's no body to validate beyond "valid JSON".

export const sendWelcomeEmailSchema = z.object({}).passthrough();

// ── agency-invitations ───────────────────────────────────────────────────

export const agencyInvitationsSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("invite"),
    agency_id: uuidField,
    email: emailField,
    role: z.enum(["manager", "staff"]),
  }),
  z.object({ action: z.literal("accept"), token: z.string().trim().min(32).max(256) }),
  z.object({ action: z.literal("revoke"), invitation_id: uuidField }),
]);

// ── booking-token-response ───────────────────────────────────────────────
// token is the raw one-time value emailed/texted to the agency (32 random
// bytes, hex-encoded = 64 characters) — never the hash stored server-side.

export const bookingTokenResponseSchema = z.object({
  token: z.string().trim().min(32).max(256),
  accept: z.boolean(),
  reason: z.string().trim().min(10).max(500).optional(),
});

// ── verify-password ──────────────────────────────────────────────────────

export const verifyPasswordSchema = z.object({
  password: z.string().min(1).max(200),
});
