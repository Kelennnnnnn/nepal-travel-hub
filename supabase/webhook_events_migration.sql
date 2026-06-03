-- Dedup table so Stripe webhook retries never double-process an event.
CREATE TABLE IF NOT EXISTS public.webhook_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_type
  ON public.webhook_events(event_type);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies = only service role (edge functions) can touch it. Correct.
