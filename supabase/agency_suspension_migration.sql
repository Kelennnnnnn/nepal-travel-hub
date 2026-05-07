-- Add "suspended" to the agency_applications status enum
ALTER TABLE public.agency_applications DROP CONSTRAINT IF EXISTS agency_applications_status_check;
ALTER TABLE public.agency_applications ADD CONSTRAINT agency_applications_status_check
  CHECK (status IN ('pending', 'in_review', 'verified', 'rejected', 'suspended'));
