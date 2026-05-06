-- Contact form submissions table
CREATE TABLE IF NOT EXISTS contact_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'replied', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only admins / service role can read submissions; no public access
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

-- Deny all client-side access — submissions are write-only from the Edge Function
-- (The Edge Function uses the service-role key, which bypasses RLS)
DROP POLICY IF EXISTS "no_public_access" ON contact_submissions;

CREATE POLICY "no_public_access" ON contact_submissions
  FOR ALL USING (false);
