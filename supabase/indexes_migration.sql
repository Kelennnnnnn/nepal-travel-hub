-- Indexes for hot-path queries that currently force sequential scans:
-- webhook lookups by payment_intent_id, traveler/agency dashboards filtering
-- by user + status, admin lists ordering by created_at, availability lookups
-- by listing, and the published-listings browse query.

CREATE INDEX IF NOT EXISTS idx_bookings_payment_intent  ON public.bookings(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_bookings_traveler        ON public.bookings(traveler_id);
CREATE INDEX IF NOT EXISTS idx_bookings_agency          ON public.bookings(agency_id);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status  ON public.bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_status          ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at      ON public.bookings(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_availability_listing     ON public.availability(listing_id);

CREATE INDEX IF NOT EXISTS idx_listings_published        ON public.listings(id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_listings_agency           ON public.listings(agency_id);

CREATE INDEX IF NOT EXISTS idx_agency_applications_user  ON public.agency_applications(user_id);
