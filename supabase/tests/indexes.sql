-- Confirms every index added by
-- supabase/migrations/20260917000020_indexes.sql actually exists (has_index()
-- isn't available in this pgTAP install, so these check pg_indexes directly).
-- Run via: supabase test db supabase/tests/indexes.sql
begin;
create extension if not exists pgtap;

select plan(19);

select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'audit_logs' and indexname = 'idx_audit_logs_created_at'), 'audit_logs: idx_audit_logs_created_at exists');

select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'booking_quotes' and indexname = 'idx_booking_quotes_agency'), 'booking_quotes: idx_booking_quotes_agency exists');
select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'booking_quotes' and indexname = 'idx_booking_quotes_listing'), 'booking_quotes: idx_booking_quotes_listing exists');
select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'booking_quotes' and indexname = 'idx_booking_quotes_inventory_reservation'), 'booking_quotes: idx_booking_quotes_inventory_reservation exists');

select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'bookings' and indexname = 'idx_bookings_quote'), 'bookings: idx_bookings_quote exists');
select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'bookings' and indexname = 'idx_bookings_traveler_created'), 'bookings: idx_bookings_traveler_created exists');
select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'bookings' and indexname = 'idx_bookings_agency_status_created'), 'bookings: idx_bookings_agency_status_created exists');

select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'reviews' and indexname = 'idx_reviews_traveler'), 'reviews: idx_reviews_traveler exists');
select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'reviews' and indexname = 'idx_reviews_listing_visible_created'), 'reviews: idx_reviews_listing_visible_created exists');

select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'review_votes' and indexname = 'idx_review_votes_user'), 'review_votes: idx_review_votes_user exists');

select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'messages' and indexname = 'idx_messages_sender'), 'messages: idx_messages_sender exists');

select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'notifications' and indexname = 'idx_notifications_domain_event'), 'notifications: idx_notifications_domain_event exists');
select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'notifications' and indexname = 'idx_notifications_status_next_attempt'), 'notifications: idx_notifications_status_next_attempt exists');

select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'contact_submissions' and indexname = 'idx_contact_submissions_status_created'), 'contact_submissions: idx_contact_submissions_status_created exists');

select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'agency_verification' and indexname = 'idx_agency_verification_status_submitted'), 'agency_verification: idx_agency_verification_status_submitted exists');

-- idx_listings_agency_status and idx_listings_published_created were
-- superseded by supabase/migrations/20260917000022_listings_index_audit.sql
-- (idx_listings_agency_status_created and idx_listings_created_at
-- respectively) — see supabase/tests/listings-index-audit.sql for those.
select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'listings' and indexname = 'idx_listings_agency_status_created'), 'listings: idx_listings_agency_status_created exists (supersedes idx_listings_agency_status)');
select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'listings' and indexname = 'idx_listings_created_at'), 'listings: idx_listings_created_at exists (supersedes idx_listings_published_created)');

select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'conversations' and indexname = 'idx_conversations_agency_last_message'), 'conversations: idx_conversations_agency_last_message exists');

select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'agency_invitations' and indexname = 'idx_agency_invitations_agency_pending'), 'agency_invitations: idx_agency_invitations_agency_pending exists');

select * from finish();
rollback;
