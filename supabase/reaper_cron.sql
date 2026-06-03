-- Requires pg_cron + pg_net extensions (enable in Supabase Dashboard > Database > Extensions)
-- Replace <YOUR-PROJECT-REF> and <YOUR-SERVICE-ROLE-KEY> before running.
SELECT cron.schedule(
  'reap-stale-bookings',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/reap-stale-bookings',
    headers := jsonb_build_object('Authorization', 'Bearer <YOUR-SERVICE-ROLE-KEY>')
  );
  $$
);
