-- Adds the missing indexes identified by a query-pattern review of
-- admin/agency dashboards, the notification dispatcher, and the review/
-- messaging RLS policies. Every index below was checked against `pg_indexes`
-- first (schemaname='public') — none of the 19 requested indexes already
-- exist under an equivalent definition. Two are worth calling out as
-- OVERLAPPING (not duplicating) existing indexes, added anyway per the
-- explicit request since they are not literally the same index and each
-- serves a query pattern the existing one doesn't cover as well:
--   - listings (agency_id, status): the existing idx_listings_agency is
--     agency_id-only — an agency dashboard's "my listings, filtered by
--     status" query benefits from status being in the index too.
--   - listings (created_at desc) WHERE status = 'published': the existing
--     idx_listings_status_created (status, created_at desc) already serves
--     this, but is a full (non-partial) index across every status value.
--     The new partial index is smaller and specific to exactly the public
--     listing feed's own filter — kept both rather than dropping the
--     existing one, which is out of scope here ("do not change existing
--     data semantics beyond these checks").
-- `create index if not exists` throughout so a partial/prior application
-- of this migration is idempotent.
-- ============================================================================

create index if not exists idx_audit_logs_created_at
  on public.audit_logs (created_at desc);

create index if not exists idx_booking_quotes_agency
  on public.booking_quotes (agency_id);
create index if not exists idx_booking_quotes_listing
  on public.booking_quotes (listing_id);
create index if not exists idx_booking_quotes_inventory_reservation
  on public.booking_quotes (inventory_reservation_id);

create index if not exists idx_bookings_quote
  on public.bookings (quote_id);
create index if not exists idx_bookings_traveler_created
  on public.bookings (traveler_id, created_at desc);
create index if not exists idx_bookings_agency_status_created
  on public.bookings (agency_id, booking_status, created_at desc);

create index if not exists idx_reviews_traveler
  on public.reviews (traveler_id);
create index if not exists idx_reviews_listing_visible_created
  on public.reviews (listing_id, created_at desc)
  where hidden_at is null;

create index if not exists idx_review_votes_user
  on public.review_votes (user_id);

create index if not exists idx_messages_sender
  on public.messages (sender_id);

create index if not exists idx_notifications_domain_event
  on public.notifications (domain_event_id);
create index if not exists idx_notifications_status_next_attempt
  on public.notifications (status, next_attempt_at)
  where status in ('queued', 'failed');

create index if not exists idx_contact_submissions_status_created
  on public.contact_submissions (status, created_at desc);

create index if not exists idx_agency_verification_status_submitted
  on public.agency_verification (status, submitted_at);

create index if not exists idx_listings_agency_status
  on public.listings (agency_id, status);
create index if not exists idx_listings_published_created
  on public.listings (created_at desc)
  where status = 'published';

create index if not exists idx_conversations_agency_last_message
  on public.conversations (agency_id, last_message_at desc);

create index if not exists idx_agency_invitations_agency_pending
  on public.agency_invitations (agency_id)
  where accepted_at is null and revoked_at is null;
