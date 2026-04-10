-- Run in Supabase Dashboard → SQL Editor

CREATE OR REPLACE FUNCTION public.listings_available_on_date(target_date DATE)
RETURNS SETOF UUID AS $$
  SELECT DISTINCT a.listing_id
  FROM public.availability a
  JOIN public.listings l ON l.id = a.listing_id
  WHERE a.date = target_date
    AND a.blocked = false
    AND a.spots_remaining > 0
    AND l.status = 'published';
$$ LANGUAGE sql STABLE SECURITY DEFINER;
