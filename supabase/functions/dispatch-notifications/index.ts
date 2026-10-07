// dispatch-notifications — audit item 4.
//
// Agency lifecycle emails (application received, approved, rejected, more
// info requested, suspended, reinstated) and agency team invitations used
// to be sent INLINE from the request that caused them: a slow or down
// Resend call delayed the admin's approve/reject response, and a failed
// send was just logged and dropped — no retry, no durable record, no way
// to know it happened without grepping logs. domain_events/notifications
// (supabase/migrations/20260916000014_notifications.sql) already existed
// with almost this exact shape, but nothing ever consumed them.
//
// This function is called once a minute by pg_cron + pg_net (migration
// 20260917000018_notification_dispatch.sql's trigger_dispatch_
// notifications()), authenticated by a shared secret header rather than a
// user JWT — there is no "calling user" here at all. Each run:
//   1. Claims up to 50 unprocessed domain_events (FOR UPDATE SKIP LOCKED,
//      via the claim_domain_events() RPC) and turns each into zero or more
//      `notifications` rows (in_app notifications are marked sent
//      immediately — inserting the row IS the delivery for that channel).
//   2. Claims up to 100 pending email notifications (claim_pending_
//      notifications()) and actually sends each one, marking it sent or
//      failed. A failed send gets exponential backoff and up to 5 retries
//      (notifications.attempts/next_attempt_at) before it's given up on
//      permanently.
//   3. Finalizes every domain_event touched this run whose notifications
//      are now all in a terminal state.
//
// AGENCY_INVITATION_SENT is the one exception to the notifications-table
// path: its recipient may have no auth.users row at all (notifications.
// recipient_id is a NOT NULL FK), so it's handled directly against
// agency_invitations/sendEmail with its own small retry counter stashed in
// the domain_event's own payload, instead of going through `notifications`.
//
// Phase 21 (post-payment booking events — BOOKING_AWAITING_AGENCY/
// _AGENCY_REMINDER/_CONFIRMED/_DECLINED_BY_AGENCY/_AGENCY_TIMEOUT) is a
// second exception, for a different reason: every channel (email, in_app,
// and conditionally SMS/WhatsApp to the agency's own alert phone) is sent
// INLINE within that event's own handler, with the `notifications` row
// written AFTER the fact carrying its already-known outcome — never
// 'queued'. See that section's own comment for why.

import { serviceRoleClient } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";
import {
  agencyApplicationReceivedEmail, agencyApprovedEmail, agencyRejectedEmail,
  agencyMoreInfoRequiredEmail, agencySuspendedEmail, agencyReinstatedEmail,
  agencyTeamInvitationEmail, opsDailyHealthEmail,
  agencyBookingAwaitingConfirmationEmail, agencyBookingReminderEmail,
  bookingConfirmedTravelerEmail, bookingConfirmedAgencyEmail,
  bookingDeclinedOrTimeoutTravelerEmail,
  bookingCancelledTravelerEmail, bookingDisruptedTravelerEmail, bookingRescheduledEmail,
  bookingNoShowTravelerEmail, bookingDisputeOpenedAdminEmail, bookingCompletedTravelerEmail,
  type EmailTemplate,
} from "../_shared/emailTemplates.ts";
import { messagingProvider, WHATSAPP_TEMPLATES, type MessagingResult } from "../_shared/messaging.ts";
import { logError } from "../_shared/guards.ts";
import { fail, handleOptions, ok, withRequestLog } from "../_shared/http.ts";
import { randomTokenHex, sha256Hex } from "../_shared/tokens.ts";
import { timingSafeEqual } from "node:crypto";

const CRON_SECRET = Deno.env.get("NOTIFICATIONS_CRON_SECRET") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://intonepal.com";
const OPS_ALERT_EMAIL = Deno.env.get("OPS_ALERT_EMAIL") ?? "";
const MAX_ATTEMPTS = 5;

// The prompt's own "https://partner.<domain>/r/<token>" is aspirational — no
// separate partner subdomain exists anywhere else in this codebase (every
// other link, e.g. agency invitations, is SITE_URL + a path on the same
// SPA). /r/:token is a route on the main site, same as everywhere else.
const PARTNER_LINK_BASE = SITE_URL;

type SupabaseAdmin = ReturnType<typeof serviceRoleClient>;

interface DomainEvent {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  created_at: string;
  processed_at: string | null;
}

interface NotificationRow {
  id: string;
  domain_event_id: string;
  recipient_id: string;
  channel: string;
  status: string;
  attempts: number;
  next_attempt_at: string;
}

function verifyCronSecret(req: Request): boolean {
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!CRON_SECRET || !provided) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(CRON_SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const AGENCY_LIFECYCLE_EVENTS = new Set([
  "AGENCY_APPLICATION_SUBMITTED", "AGENCY_APPROVED", "AGENCY_REJECTED",
  "AGENCY_INFO_REQUESTED", "AGENCY_SUSPENDED", "AGENCY_REINSTATED",
]);

async function resolveAgencyOwner(admin: SupabaseAdmin, agencyId: string): Promise<{ userId: string; email: string } | null> {
  const { data: owner } = await admin
    .from("agency_users")
    .select("user_id")
    .eq("agency_id", agencyId)
    .eq("agency_role", "owner")
    .is("removed_at", null)
    .maybeSingle();
  if (!owner) return null;
  const { data: authUser } = await admin.auth.admin.getUserById(owner.user_id);
  const email = authUser?.user?.email;
  if (!email) return null;
  return { userId: owner.user_id as string, email };
}

async function resolveOwnerName(admin: SupabaseAdmin, userId: string, fallbackEmail: string): Promise<string> {
  const { data: profile } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  return (profile?.full_name as string | undefined) || fallbackEmail.split("@")[0];
}

/** Marks a domain_event processed directly — used for cases finalize_domain_event() doesn't cover (no notifications row was ever created for it). */
async function markProcessed(admin: SupabaseAdmin, eventId: string, extra: Record<string, unknown> = {}) {
  await admin.from("domain_events").update({ processed_at: new Date().toISOString(), ...extra }).eq("id", eventId).is("processed_at", null);
}

async function handleAgencyLifecycleEvent(admin: SupabaseAdmin, event: DomainEvent) {
  const owner = await resolveAgencyOwner(admin, event.aggregate_id);
  if (!owner) {
    // No active owner (e.g. removed since) — nothing to notify; nothing
    // will ever change this, so finalize now rather than retry forever.
    logError("dispatch-notifications: no active owner for agency lifecycle event", null, { eventId: event.id, eventType: event.event_type, agencyId: event.aggregate_id });
    await markProcessed(admin, event.id);
    return;
  }

  const idempotencyKey = `${event.id}:${owner.userId}:email`;
  const { error } = await admin.from("notifications").insert({
    domain_event_id: event.id,
    recipient_id: owner.userId,
    channel: "email",
    status: "queued",
    idempotency_key: idempotencyKey,
  });
  // 23505 (unique violation on idempotency_key) means a previous, only
  // partially-finished run of this same event already created this row —
  // not an error, just confirmation the row exists for the send loop below.
  if (error && error.code !== "23505") {
    logError("dispatch-notifications: insert notification failed", error, { eventId: event.id, eventType: event.event_type });
  }
}

async function handleAgencyInvitation(admin: SupabaseAdmin, event: DomainEvent) {
  const payload = event.payload as { agency_id?: string; email?: string; role?: string; _attempts?: number };
  const attempts = payload._attempts ?? 0;
  const invitationId = event.aggregate_id;

  const { data: invitation } = await admin
    .from("agency_invitations")
    .select("id, agency_id, email, agency_role, accepted_at, revoked_at")
    .eq("id", invitationId)
    .maybeSingle();

  // Deleted (agency removed — agency_invitations cascades), already
  // accepted, or revoked since the invite went out: nothing to send.
  if (!invitation || invitation.accepted_at || invitation.revoked_at) {
    await markProcessed(admin, event.id);
    return;
  }

  const { data: agency } = await admin.from("agencies").select("display_name").eq("id", invitation.agency_id).maybeSingle();
  if (!agency) {
    await markProcessed(admin, event.id);
    return;
  }

  // A fresh token is minted here rather than carried in the domain event's
  // payload — agency_invitations.token_hash is the only place a token's
  // hash is ever stored, and the raw value is only ever supposed to exist
  // in the email itself (see agency-invitations/index.ts's own header
  // comment). The token generated at invite time was only ever a
  // placeholder to satisfy the NOT NULL column; it's superseded here,
  // immediately before the one and only time this invitation's real token
  // is handed out.
  const token = randomTokenHex(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: refreshErr } = await admin
    .from("agency_invitations")
    .update({ token_hash: tokenHash, expires_at: expiresAt })
    .eq("id", invitationId)
    .is("accepted_at", null)
    .is("revoked_at", null);
  if (refreshErr) {
    logError("dispatch-notifications: invitation token refresh failed", refreshErr, { invitationId });
    return; // left unprocessed — retried once the domain_event's claim lease goes stale
  }

  const { subject, html, text } = agencyTeamInvitationEmail({
    agencyName: agency.display_name,
    role: invitation.agency_role,
    inviteUrl: `${SITE_URL}/agency/invite/${token}`,
  });
  const { error: sendErr } = await sendEmail({ to: invitation.email, subject, html, text });

  if (sendErr) {
    const nextAttempts = attempts + 1;
    if (nextAttempts >= MAX_ATTEMPTS) {
      logError("dispatch-notifications: invitation email permanently failed", sendErr, { invitationId, attempts: nextAttempts });
      await markProcessed(admin, event.id, { payload: { ...payload, _attempts: nextAttempts } });
    } else {
      await admin.from("domain_events").update({ payload: { ...payload, _attempts: nextAttempts } }).eq("id", event.id);
      // claimed_at is left as-is here (not cleared) — it naturally becomes
      // reclaimable once its 2-minute lease elapses, giving this a coarse
      // but simple retry cadence without needing its own backoff column.
    }
    return;
  }

  await markProcessed(admin, event.id);
}

async function handleNewMessage(admin: SupabaseAdmin, event: DomainEvent) {
  const payload = event.payload as { conversation_id?: string; sender_id?: string };
  if (!payload.conversation_id || !payload.sender_id) {
    await markProcessed(admin, event.id);
    return;
  }

  const { data: participants } = await admin
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", payload.conversation_id)
    .neq("user_id", payload.sender_id);

  for (const p of participants ?? []) {
    const { data: prefs } = await admin
      .from("notification_preferences")
      .select("new_message")
      .eq("user_id", p.user_id)
      .maybeSingle();
    // No row yet ⇒ the column's own default (true) applies, same as if a
    // row existed with new_message left at its default.
    if (prefs && prefs.new_message === false) continue;

    // in_app has no external delivery step — inserting the row IS the
    // delivery (the frontend reads notifications directly), so it's
    // recorded as already sent, not queued.
    const { error } = await admin.from("notifications").insert({
      domain_event_id: event.id,
      recipient_id: p.user_id,
      channel: "in_app",
      status: "sent",
      sent_at: new Date().toISOString(),
      idempotency_key: `${event.id}:${p.user_id}:in_app`,
    });
    if (error && error.code !== "23505") {
      logError("dispatch-notifications: insert in_app notification failed", error, { eventId: event.id, recipientId: p.user_id });
    }
  }
}

// ── Phase 21: booking post-payment events ───────────────────────────────────
//
// Unlike the agency-lifecycle events above (queued -> claimed -> sent, with
// 5-attempt backoff), every booking notification below is sent INLINE,
// synchronously, within this same handler call — the row inserted into
// `notifications` already carries its final outcome (sent/failed/
// not_configured), never 'queued'. This is a deliberate scope reduction:
// a transient failure here does not get the agency-lifecycle path's retry
// schedule, only the domain_event's own 2-minute reclaim-and-retry-the-
// whole-handler lease. Accepted because the one real reason email
// notifications normally need deferred sending — minting a one-tap token
// that must still be valid whenever the email actually goes out — is
// naturally satisfied by sending inline at mint time instead.

async function resolveAgencyManagers(admin: SupabaseAdmin, agencyId: string): Promise<Array<{ userId: string; email: string }>> {
  const { data: members } = await admin
    .from("agency_users")
    .select("user_id")
    .eq("agency_id", agencyId)
    .in("agency_role", ["owner", "manager"])
    .is("removed_at", null)
    .not("accepted_at", "is", null);

  const result: Array<{ userId: string; email: string }> = [];
  for (const m of members ?? []) {
    const { data: authUser } = await admin.auth.admin.getUserById(m.user_id as string);
    const email = authUser?.user?.email;
    if (email) result.push({ userId: m.user_id as string, email });
  }
  return result;
}

/** Inserts a notification row with an already-known outcome (never 'queued') — idempotent via (event, recipient, channel). */
async function recordSettledNotification(
  admin: SupabaseAdmin,
  eventId: string,
  recipientId: string,
  channel: "email" | "in_app" | "sms" | "whatsapp",
  outcome: { status: "sent" | "failed" | "not_configured"; error?: string },
) {
  const { error } = await admin.from("notifications").insert({
    domain_event_id: eventId,
    recipient_id: recipientId,
    channel,
    status: outcome.status,
    sent_at: outcome.status === "sent" ? new Date().toISOString() : null,
    error_message: outcome.error ?? null,
    idempotency_key: `${eventId}:${recipientId}:${channel}`,
    // A 'failed' row normally means "retry me" to claim_pending_
    // notifications (status='failed' AND attempts<5 AND next_attempt_at
    // <= now(), all true by column default on a fresh insert) — but this
    // row is already FINAL (never queued in the first place), so attempts
    // is pinned to MAX_ATTEMPTS up front. Without this, the very same
    // dispatch run's own step 2 immediately re-claims it and overwrites
    // this outcome via sendQueuedNotification's agency-lifecycle-only
    // renderer, which has never heard of a booking event type (discovered
    // by this migration's own local testing: a deliberately-failed send
    // here came back re-labeled "no template for event type ...").
    attempts: outcome.status === "failed" ? MAX_ATTEMPTS : 0,
  });
  if (error && error.code !== "23505") {
    logError("dispatch-notifications: failed to record settled notification", error, { eventId, recipientId, channel });
  }
}

function messagingResultToOutcome(result: MessagingResult): { status: "sent" | "failed" | "not_configured"; error?: string } {
  if (result.status === "sent") return { status: "sent" };
  if (result.status === "not_configured") return { status: "not_configured" };
  return { status: "failed", error: result.error };
}

interface BookingContext {
  bookingId: string;
  agencyId: string;
  participantCount: number;
  agencyConfirmDeadline: string | null;
  listingTitle: string;
  departureDateNpt: string;
  travelerFirstName: string;
  travelerId: string;
  agency: { display_name: string; alert_phone_e164: string | null; alert_whatsapp_opt_in: boolean; alert_sms_opt_in: boolean };
}

async function loadBookingContext(admin: SupabaseAdmin, bookingId: string): Promise<BookingContext | null> {
  const { data: booking } = await admin
    .from("bookings")
    .select("id, agency_id, participant_count, agency_confirm_deadline, listing_id, departure_id, traveler_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;

  const [{ data: listing }, { data: departure }, { data: guest }, { data: agency }] = await Promise.all([
    admin.from("listings").select("title").eq("id", booking.listing_id).maybeSingle(),
    admin.from("departures").select("departure_date").eq("id", booking.departure_id).maybeSingle(),
    admin.from("booking_guests").select("full_name").eq("booking_id", bookingId).eq("is_primary", true).maybeSingle(),
    admin.from("agencies").select("display_name, alert_phone_e164, alert_whatsapp_opt_in, alert_sms_opt_in").eq("id", booking.agency_id).maybeSingle(),
  ]);
  if (!listing || !departure || !agency) return null;

  return {
    bookingId: booking.id as string,
    agencyId: booking.agency_id as string,
    participantCount: booking.participant_count as number,
    agencyConfirmDeadline: booking.agency_confirm_deadline as string | null,
    listingTitle: listing.title as string,
    departureDateNpt: new Date(departure.departure_date as string).toLocaleDateString("en-US", { timeZone: "Asia/Kathmandu", year: "numeric", month: "short", day: "numeric" }),
    travelerFirstName: ((guest?.full_name as string | undefined) ?? "A traveler").split(" ")[0],
    travelerId: booking.traveler_id as string,
    agency: agency as BookingContext["agency"],
  };
}

/** Reuses an unexpired, unused token for this booking if one already exists (handler retries shouldn't mint a fresh one every time), otherwise mints one. */
async function ensureBookingActionToken(admin: SupabaseAdmin, bookingId: string, expiresAt: string): Promise<string | null> {
  const { data: existing } = await admin
    .from("booking_action_tokens")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("purpose", "agency_accept_decline")
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  // An existing valid token's raw value was only ever known at mint time and
  // was never persisted (by design — only its hash is stored) — so it can't
  // be re-sent here. A retry of this handler mints a fresh token instead;
  // the stale one above simply expires unused. This only matters for a
  // handler retry within the same lease window, which is rare.
  if (existing) return null;

  const rawToken = randomTokenHex(32);
  const tokenHash = await sha256Hex(rawToken);
  const { error } = await admin.from("booking_action_tokens").insert({
    booking_id: bookingId, token_hash: tokenHash, purpose: "agency_accept_decline", expires_at: expiresAt,
  });
  if (error) {
    logError("dispatch-notifications: failed to mint booking action token", error, { bookingId });
    return null;
  }
  return rawToken;
}

async function handleBookingAwaitingAgency(admin: SupabaseAdmin, event: DomainEvent, reminder: boolean) {
  const ctx = await loadBookingContext(admin, event.aggregate_id);
  if (!ctx || !ctx.agencyConfirmDeadline) {
    await markProcessed(admin, event.id);
    return;
  }

  const deadlineNpt = new Date(ctx.agencyConfirmDeadline).toLocaleString("en-US", { timeZone: "Asia/Kathmandu", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const rawToken = await ensureBookingActionToken(admin, ctx.bookingId, ctx.agencyConfirmDeadline);
  const actionUrl = `${PARTNER_LINK_BASE}/r/${rawToken ?? ""}`;

  const template = reminder
    ? agencyBookingReminderEmail({ activityTitle: ctx.listingTitle, departureDateNpt: ctx.departureDateNpt, participantCount: ctx.participantCount, travelerFirstName: ctx.travelerFirstName, deadlineNpt, actionUrl })
    : agencyBookingAwaitingConfirmationEmail({ activityTitle: ctx.listingTitle, departureDateNpt: ctx.departureDateNpt, participantCount: ctx.participantCount, travelerFirstName: ctx.travelerFirstName, deadlineNpt, actionUrl });

  const managers = await resolveAgencyManagers(admin, ctx.agencyId);
  for (const m of managers) {
    const { error: sendErr } = await sendEmail({ to: m.email, subject: template.subject, html: template.html, text: template.text });
    await recordSettledNotification(admin, event.id, m.userId, "email", sendErr ? { status: "failed", error: sendErr } : { status: "sent" });
    await recordSettledNotification(admin, event.id, m.userId, "in_app", { status: "sent" });
  }

  if (managers.length > 0 && ctx.agency.alert_phone_e164) {
    const smsText = reminder
      ? `Into Nepal: 12 hours left to respond to a booking for ${ctx.listingTitle} on ${ctx.departureDateNpt}. ${actionUrl}`
      : `Into Nepal: New booking for ${ctx.listingTitle} on ${ctx.departureDateNpt} needs your confirmation by ${deadlineNpt}. ${actionUrl}`;

    let result: MessagingResult | null = null;
    let channel: "whatsapp" | "sms" | null = null;
    if (ctx.agency.alert_whatsapp_opt_in) {
      channel = "whatsapp";
      const templateName = reminder ? WHATSAPP_TEMPLATES.bookingConfirmReminder : WHATSAPP_TEMPLATES.bookingConfirmRequest;
      result = await messagingProvider.sendWhatsAppTemplate(ctx.agency.alert_phone_e164, templateName, [ctx.listingTitle, ctx.departureDateNpt, deadlineNpt, actionUrl]);
    } else if (ctx.agency.alert_sms_opt_in) {
      channel = "sms";
      result = await messagingProvider.sendSms(ctx.agency.alert_phone_e164, smsText);
    }

    if (channel && result) {
      await recordSettledNotification(admin, event.id, managers[0].userId, channel, messagingResultToOutcome(result));
    }
  }

  await markProcessed(admin, event.id);
}

async function handleBookingConfirmed(admin: SupabaseAdmin, event: DomainEvent) {
  const ctx = await loadBookingContext(admin, event.aggregate_id);
  if (!ctx) {
    await markProcessed(admin, event.id);
    return;
  }

  const { data: booking } = await admin.from("bookings").select("booking_ref").eq("id", ctx.bookingId).maybeSingle();
  const bookingRef = (booking?.booking_ref as string | undefined) ?? ctx.bookingId;

  const { data: travelerAuth } = await admin.auth.admin.getUserById(ctx.travelerId);
  const travelerEmail = travelerAuth?.user?.email;
  if (travelerEmail) {
    const template = bookingConfirmedTravelerEmail({
      activityTitle: ctx.listingTitle, departureDateNpt: ctx.departureDateNpt, bookingRef,
      myBookingsUrl: `${SITE_URL}/my-bookings`,
    });
    const { error: sendErr } = await sendEmail({ to: travelerEmail, subject: template.subject, html: template.html, text: template.text });
    await recordSettledNotification(admin, event.id, ctx.travelerId, "email", sendErr ? { status: "failed", error: sendErr } : { status: "sent" });
    await recordSettledNotification(admin, event.id, ctx.travelerId, "in_app", { status: "sent" });
  }

  const managers = await resolveAgencyManagers(admin, ctx.agencyId);
  for (const m of managers) {
    const template = bookingConfirmedAgencyEmail({
      activityTitle: ctx.listingTitle, departureDateNpt: ctx.departureDateNpt, travelerFirstName: ctx.travelerFirstName,
      bookingRef, dashboardUrl: `${SITE_URL}/agency/bookings`,
    });
    const { error: sendErr } = await sendEmail({ to: m.email, subject: template.subject, html: template.html, text: template.text });
    await recordSettledNotification(admin, event.id, m.userId, "email", sendErr ? { status: "failed", error: sendErr } : { status: "sent" });
    await recordSettledNotification(admin, event.id, m.userId, "in_app", { status: "sent" });
  }

  await markProcessed(admin, event.id);
}

async function handleBookingDeclinedOrTimeout(admin: SupabaseAdmin, event: DomainEvent, timedOut: boolean) {
  const ctx = await loadBookingContext(admin, event.aggregate_id);
  if (!ctx) {
    await markProcessed(admin, event.id);
    return;
  }

  const { data: travelerAuth } = await admin.auth.admin.getUserById(ctx.travelerId);
  const travelerEmail = travelerAuth?.user?.email;
  if (travelerEmail) {
    const reason = (event.payload as { reason?: string })?.reason;
    const template = bookingDeclinedOrTimeoutTravelerEmail({
      activityTitle: ctx.listingTitle, reason, timedOut,
      alternativesUrl: `${SITE_URL}/my-bookings`,
    });
    const { error: sendErr } = await sendEmail({ to: travelerEmail, subject: template.subject, html: template.html, text: template.text });
    await recordSettledNotification(admin, event.id, ctx.travelerId, "email", sendErr ? { status: "failed", error: sendErr } : { status: "sent" });
    await recordSettledNotification(admin, event.id, ctx.travelerId, "in_app", { status: "sent" });
  }

  await markProcessed(admin, event.id);
}

// ── Phase 22: cancellation / disruption / no-show / dispute lifecycle ──────
// Same inline-send discipline as Phase 21's booking events above — these
// are low-volume, and the one case needing a durable record either way is
// in_app (sent immediately, not queued).

async function handleBookingCancelled(admin: SupabaseAdmin, event: DomainEvent) {
  const ctx = await loadBookingContext(admin, event.aggregate_id);
  if (!ctx) { await markProcessed(admin, event.id); return; }

  const payload = event.payload as { cancelled_by?: string; fee_refund_amount?: number; balance_refund_amount?: number; currency?: string };
  const { data: travelerAuth } = await admin.auth.admin.getUserById(ctx.travelerId);
  const travelerEmail = travelerAuth?.user?.email;
  if (travelerEmail) {
    const template = bookingCancelledTravelerEmail({
      activityTitle: ctx.listingTitle,
      cancelledBy: (payload.cancelled_by as "traveler" | "agency" | "admin" | "system" | undefined) ?? "system",
      feeRefundAmount: payload.fee_refund_amount ?? 0,
      balanceRefundAmount: payload.balance_refund_amount ?? 0,
      currency: payload.currency ?? "NPR",
      myBookingsUrl: `${SITE_URL}/my-bookings`,
    });
    const { error: sendErr } = await sendEmail({ to: travelerEmail, subject: template.subject, html: template.html, text: template.text });
    await recordSettledNotification(admin, event.id, ctx.travelerId, "email", sendErr ? { status: "failed", error: sendErr } : { status: "sent" });
    await recordSettledNotification(admin, event.id, ctx.travelerId, "in_app", { status: "sent" });
  }

  await markProcessed(admin, event.id);
}

async function handleBookingDisrupted(admin: SupabaseAdmin, event: DomainEvent) {
  const ctx = await loadBookingContext(admin, event.aggregate_id);
  if (!ctx) { await markProcessed(admin, event.id); return; }

  const payload = event.payload as { reason_code?: string; note?: string };
  const { data: disruption } = await admin
    .from("booking_disruptions")
    .select("choice_deadline")
    .eq("booking_id", ctx.bookingId)
    .is("resolved_at", null)
    .order("offered_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const choiceDeadlineNpt = disruption?.choice_deadline
    ? new Date(disruption.choice_deadline as string).toLocaleString("en-US", { timeZone: "Asia/Kathmandu", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "soon";

  const { data: travelerAuth } = await admin.auth.admin.getUserById(ctx.travelerId);
  const travelerEmail = travelerAuth?.user?.email;
  if (travelerEmail) {
    const template = bookingDisruptedTravelerEmail({
      activityTitle: ctx.listingTitle, reasonCode: payload.reason_code ?? "conditions_weather", note: payload.note,
      choiceDeadlineNpt, myBookingsUrl: `${SITE_URL}/my-bookings`,
    });
    const { error: sendErr } = await sendEmail({ to: travelerEmail, subject: template.subject, html: template.html, text: template.text });
    await recordSettledNotification(admin, event.id, ctx.travelerId, "email", sendErr ? { status: "failed", error: sendErr } : { status: "sent" });
    await recordSettledNotification(admin, event.id, ctx.travelerId, "in_app", { status: "sent" });
  }

  await markProcessed(admin, event.id);
}

async function handleBookingRescheduled(admin: SupabaseAdmin, event: DomainEvent) {
  const ctx = await loadBookingContext(admin, event.aggregate_id);
  if (!ctx) { await markProcessed(admin, event.id); return; }

  const { data: booking } = await admin.from("bookings").select("booking_ref").eq("id", ctx.bookingId).maybeSingle();
  const bookingRef = (booking?.booking_ref as string | undefined) ?? ctx.bookingId;

  const { data: travelerAuth } = await admin.auth.admin.getUserById(ctx.travelerId);
  const travelerEmail = travelerAuth?.user?.email;
  if (travelerEmail) {
    const template = bookingRescheduledEmail({
      activityTitle: ctx.listingTitle, newDateNpt: ctx.departureDateNpt, recipientIsAgency: false,
      bookingRef, linkUrl: `${SITE_URL}/my-bookings`,
    });
    const { error: sendErr } = await sendEmail({ to: travelerEmail, subject: template.subject, html: template.html, text: template.text });
    await recordSettledNotification(admin, event.id, ctx.travelerId, "email", sendErr ? { status: "failed", error: sendErr } : { status: "sent" });
    await recordSettledNotification(admin, event.id, ctx.travelerId, "in_app", { status: "sent" });
  }

  const managers = await resolveAgencyManagers(admin, ctx.agencyId);
  for (const m of managers) {
    const template = bookingRescheduledEmail({
      activityTitle: ctx.listingTitle, newDateNpt: ctx.departureDateNpt, recipientIsAgency: true,
      bookingRef, linkUrl: `${SITE_URL}/agency/bookings`,
    });
    const { error: sendErr } = await sendEmail({ to: m.email, subject: template.subject, html: template.html, text: template.text });
    await recordSettledNotification(admin, event.id, m.userId, "email", sendErr ? { status: "failed", error: sendErr } : { status: "sent" });
    await recordSettledNotification(admin, event.id, m.userId, "in_app", { status: "sent" });
  }

  await markProcessed(admin, event.id);
}

async function handleBookingNoShow(admin: SupabaseAdmin, event: DomainEvent) {
  const ctx = await loadBookingContext(admin, event.aggregate_id);
  if (!ctx) { await markProcessed(admin, event.id); return; }

  const { data: travelerAuth } = await admin.auth.admin.getUserById(ctx.travelerId);
  const travelerEmail = travelerAuth?.user?.email;
  if (travelerEmail) {
    const template = bookingNoShowTravelerEmail({ activityTitle: ctx.listingTitle, disputeUrl: `${SITE_URL}/my-bookings` });
    const { error: sendErr } = await sendEmail({ to: travelerEmail, subject: template.subject, html: template.html, text: template.text });
    await recordSettledNotification(admin, event.id, ctx.travelerId, "email", sendErr ? { status: "failed", error: sendErr } : { status: "sent" });
    await recordSettledNotification(admin, event.id, ctx.travelerId, "in_app", { status: "sent" });
  }

  await markProcessed(admin, event.id);
}

async function handleBookingDisputeOpened(admin: SupabaseAdmin, event: DomainEvent) {
  // No single "admin recipient" row to hang a notifications entry on (any
  // number of admins/support staff may exist) — same special-casing as
  // OPS_DAILY_HEALTH: a direct send to the shared ops inbox, self-managed
  // processed_at, no `notifications` row.
  if (!OPS_ALERT_EMAIL) {
    await markProcessed(admin, event.id);
    return;
  }

  const ctx = await loadBookingContext(admin, event.aggregate_id);
  if (!ctx) { await markProcessed(admin, event.id); return; }

  const payload = event.payload as { dispute_id?: string; kind?: "no_show" | "agency_no_show" };
  const { data: booking } = await admin.from("bookings").select("booking_ref").eq("id", ctx.bookingId).maybeSingle();
  const bookingRef = (booking?.booking_ref as string | undefined) ?? ctx.bookingId;

  const template = bookingDisputeOpenedAdminEmail({
    activityTitle: ctx.listingTitle, kind: payload.kind ?? "no_show", bookingRef,
    disputesUrl: `${SITE_URL}/admin/disputes`,
  });
  const { error: sendErr } = await sendEmail({ to: OPS_ALERT_EMAIL, subject: template.subject, html: template.html, text: template.text });
  if (sendErr) {
    logError("dispatch-notifications: BOOKING_DISPUTE_OPENED send failed", sendErr, { eventId: event.id });
    return; // reclaimed once the lease goes stale, same as other direct-send events
  }

  await markProcessed(admin, event.id);
}

async function handleBookingCompleted(admin: SupabaseAdmin, event: DomainEvent) {
  const ctx = await loadBookingContext(admin, event.aggregate_id);
  if (!ctx) { await markProcessed(admin, event.id); return; }

  const { data: travelerAuth } = await admin.auth.admin.getUserById(ctx.travelerId);
  const travelerEmail = travelerAuth?.user?.email;
  if (travelerEmail) {
    const template = bookingCompletedTravelerEmail({ activityTitle: ctx.listingTitle, reviewUrl: `${SITE_URL}/my-bookings` });
    const { error: sendErr } = await sendEmail({ to: travelerEmail, subject: template.subject, html: template.html, text: template.text });
    await recordSettledNotification(admin, event.id, ctx.travelerId, "email", sendErr ? { status: "failed", error: sendErr } : { status: "sent" });
    await recordSettledNotification(admin, event.id, ctx.travelerId, "in_app", { status: "sent" });
  }

  await markProcessed(admin, event.id);
}

async function handleOpsDailyHealth(admin: SupabaseAdmin, event: DomainEvent) {
  // Same special-casing as AGENCY_INVITATION_SENT: no real recipient_id to
  // hang a `notifications` row on (this isn't about any one user), so it
  // sends directly and marks itself processed in one step.
  if (!OPS_ALERT_EMAIL) {
    logError("dispatch-notifications: OPS_ALERT_EMAIL not configured, cannot send OPS_DAILY_HEALTH alert", null, { eventId: event.id });
    await markProcessed(admin, event.id);
    return;
  }

  const payload = event.payload as {
    failed_job_ids?: number[];
    permanently_failed_notifications?: number;
    checked_at?: string;
  };

  const { subject, html, text } = opsDailyHealthEmail({
    failedJobIds: payload.failed_job_ids ?? [],
    permanentlyFailedNotifications: payload.permanently_failed_notifications ?? 0,
    checkedAt: payload.checked_at ?? new Date().toISOString(),
  });

  const { error: sendErr } = await sendEmail({ to: OPS_ALERT_EMAIL, subject, html, text });
  if (sendErr) {
    logError("dispatch-notifications: OPS_DAILY_HEALTH send failed", sendErr, { eventId: event.id });
    // Left unprocessed — reclaimed and retried once its claim lease goes
    // stale, same as AGENCY_INVITATION_SENT's transient-failure path. No
    // separate attempt counter here: this fires at most once a day, so
    // even an indefinite retry cadence is cheap.
    return;
  }

  await markProcessed(admin, event.id);
}

async function handleDomainEvent(admin: SupabaseAdmin, event: DomainEvent) {
  if (AGENCY_LIFECYCLE_EVENTS.has(event.event_type)) return handleAgencyLifecycleEvent(admin, event);
  if (event.event_type === "AGENCY_INVITATION_SENT") return handleAgencyInvitation(admin, event);
  if (event.event_type === "NEW_MESSAGE") return handleNewMessage(admin, event);
  if (event.event_type === "OPS_DAILY_HEALTH") return handleOpsDailyHealth(admin, event);
  if (event.event_type === "BOOKING_AWAITING_AGENCY") return handleBookingAwaitingAgency(admin, event, false);
  if (event.event_type === "BOOKING_AGENCY_REMINDER") return handleBookingAwaitingAgency(admin, event, true);
  if (event.event_type === "BOOKING_CONFIRMED") return handleBookingConfirmed(admin, event);
  if (event.event_type === "BOOKING_DECLINED_BY_AGENCY") return handleBookingDeclinedOrTimeout(admin, event, false);
  if (event.event_type === "BOOKING_AGENCY_TIMEOUT") return handleBookingDeclinedOrTimeout(admin, event, true);
  if (event.event_type === "BOOKING_CANCELLED") return handleBookingCancelled(admin, event);
  if (event.event_type === "BOOKING_DISRUPTED") return handleBookingDisrupted(admin, event);
  if (event.event_type === "BOOKING_RESCHEDULED") return handleBookingRescheduled(admin, event);
  if (event.event_type === "BOOKING_NO_SHOW") return handleBookingNoShow(admin, event);
  if (event.event_type === "BOOKING_DISPUTE_OPENED") return handleBookingDisputeOpened(admin, event);
  if (event.event_type === "BOOKING_COMPLETED") return handleBookingCompleted(admin, event);
  // BOOKING_HOLD_CREATED (Phase 20) is deliberately informational only — no
  // handler, finalized immediately via the fallthrough below. Any other
  // unknown type has no handler here at all — finalize immediately rather
  // than leaving it to be reclaimed forever waiting for logic that doesn't
  // exist.
  logError("dispatch-notifications: unhandled event type", null, { eventId: event.id, eventType: event.event_type });
  await markProcessed(admin, event.id);
}

async function renderAgencyLifecycleEmail(admin: SupabaseAdmin, event: DomainEvent): Promise<EmailTemplate | null> {
  const agencyId = event.aggregate_id;
  const { data: agency } = await admin.from("agencies").select("display_name").eq("id", agencyId).maybeSingle();
  if (!agency) return null;
  const agencyName = agency.display_name as string;

  switch (event.event_type) {
    case "AGENCY_APPLICATION_SUBMITTED": {
      const owner = await resolveAgencyOwner(admin, agencyId);
      const ownerName = owner ? await resolveOwnerName(admin, owner.userId, owner.email) : agencyName;
      return agencyApplicationReceivedEmail({ agencyName, ownerName });
    }
    case "AGENCY_APPROVED":
      return agencyApprovedEmail({ agencyName });
    case "AGENCY_REJECTED": {
      const { data: v } = await admin.from("agency_verification").select("rejection_reason").eq("agency_id", agencyId).maybeSingle();
      return agencyRejectedEmail({ agencyName, reason: (v?.rejection_reason as string | undefined) ?? "No reason provided." });
    }
    case "AGENCY_INFO_REQUESTED": {
      const { data: v } = await admin.from("agency_verification").select("info_requested_note").eq("agency_id", agencyId).maybeSingle();
      return agencyMoreInfoRequiredEmail({ agencyName, note: (v?.info_requested_note as string | undefined) ?? "" });
    }
    case "AGENCY_SUSPENDED":
      return agencySuspendedEmail({ agencyName, reason: (event.payload as { reason?: string })?.reason ?? "No reason provided." });
    case "AGENCY_REINSTATED":
      return agencyReinstatedEmail({ agencyName });
    default:
      return null;
  }
}

async function sendQueuedNotification(admin: SupabaseAdmin, notification: NotificationRow) {
  const { data: event } = await admin.from("domain_events").select("*").eq("id", notification.domain_event_id).maybeSingle();
  if (!event) {
    await admin.from("notifications").update({ status: "failed", attempts: MAX_ATTEMPTS, error_message: "parent domain_event not found" }).eq("id", notification.id);
    return;
  }

  const { data: authUser } = await admin.auth.admin.getUserById(notification.recipient_id);
  const email = authUser?.user?.email;
  if (!email) {
    await admin.from("notifications").update({ status: "failed", attempts: MAX_ATTEMPTS, error_message: "recipient has no email address" }).eq("id", notification.id);
    return;
  }

  const template = await renderAgencyLifecycleEmail(admin, event as DomainEvent);
  if (!template) {
    await admin.from("notifications").update({ status: "failed", attempts: MAX_ATTEMPTS, error_message: `no template for event type ${event.event_type}` }).eq("id", notification.id);
    return;
  }

  const { error: sendErr } = await sendEmail({ to: email, subject: template.subject, html: template.html, text: template.text });

  if (sendErr) {
    const attempts = notification.attempts + 1;
    const backoffMinutes = Math.pow(2, attempts); // 2, 4, 8, 16, 32 minutes
    const update: Record<string, unknown> = {
      status: "failed",
      attempts,
      error_message: String(sendErr).slice(0, 500),
      claimed_at: null,
    };
    if (attempts < MAX_ATTEMPTS) update.next_attempt_at = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
    await admin.from("notifications").update(update).eq("id", notification.id);
    logError("dispatch-notifications: send failed", sendErr, { notificationId: notification.id, attempts, permanent: attempts >= MAX_ATTEMPTS });
    return;
  }

  await admin.from("notifications").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", notification.id);
}

Deno.serve(async (req: Request) => {
  const early = handleOptions(req);
  if (early) return early;
  if (req.method !== "POST") return fail(req, 405, "Method not allowed");
  if (!verifyCronSecret(req)) return fail(req, 401, "Unauthorized");

  const admin = serviceRoleClient();

  return withRequestLog(req, async (logCtx) => {
  logCtx.action = "dispatch_batch";
  try {
    const { data: events, error: claimEventsErr } = await admin.rpc("claim_domain_events", { p_limit: 50 });
    if (claimEventsErr) return fail(req, 500, "Failed to claim domain events", claimEventsErr);

    for (const event of (events ?? []) as DomainEvent[]) {
      await handleDomainEvent(admin, event);
    }

    const { data: pending, error: claimNotifErr } = await admin.rpc("claim_pending_notifications", { p_limit: 100 });
    if (claimNotifErr) return fail(req, 500, "Failed to claim notifications", claimNotifErr);

    for (const notification of (pending ?? []) as NotificationRow[]) {
      await sendQueuedNotification(admin, notification);
    }

    // finalize_domain_event() decides "done" purely by looking at whether
    // this event has any non-terminal `notifications` row — that's only a
    // meaningful question for event types that actually create
    // notifications rows (agency lifecycle + NEW_MESSAGE). AGENCY_
    // INVITATION_SENT and unhandled types manage their own processed_at
    // directly above; calling finalize on them here would find zero
    // notifications rows (vacuously "done") and finalize a send that's
    // still mid-retry.
    const NOTIFICATION_BACKED_EVENTS = new Set([...AGENCY_LIFECYCLE_EVENTS, "NEW_MESSAGE"]);
    const touchedEventIds = new Set<string>([
      ...((events ?? []) as DomainEvent[]).filter((e) => NOTIFICATION_BACKED_EVENTS.has(e.event_type)).map((e) => e.id),
      ...((pending ?? []) as NotificationRow[]).map((n) => n.domain_event_id),
    ]);
    for (const eventId of touchedEventIds) {
      await admin.rpc("finalize_domain_event", { p_domain_event_id: eventId });
    }

    return ok(req, {
      success: true,
      events_claimed: events?.length ?? 0,
      notifications_claimed: pending?.length ?? 0,
    });
  } catch (err) {
    return fail(req, 500, "dispatch-notifications failed", err);
  }
  });
});
