CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES auth.users(id), -- NULL = automated/system event (no human admin)
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- 'agency', 'listing', 'booking', 'user', 'payout', 'settings'
  entity_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_audit" ON public.audit_log
  FOR SELECT USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

CREATE POLICY "admin_insert_audit" ON public.audit_log
  FOR INSERT WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

CREATE INDEX idx_audit_log_created ON public.audit_log(created_at DESC);
CREATE INDEX idx_audit_log_entity ON public.audit_log(entity_type, entity_id);
