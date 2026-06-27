-- Performance: compound indexes for the listings browse query.
-- The existing idx_listings_published covers status filtering but not sorting,
-- causing a sequential scan on every default page load.

-- Default sort: ORDER BY created_at DESC WHERE status = 'published'
CREATE INDEX IF NOT EXISTS idx_listings_status_created
  ON public.listings(status, created_at DESC);

-- "Highest Rated" sort
CREATE INDEX IF NOT EXISTS idx_listings_status_rating
  ON public.listings(status, rating DESC);

-- Price sorts (low-to-high and high-to-low share one index)
CREATE INDEX IF NOT EXISTS idx_listings_status_price
  ON public.listings(status, price);

-- Category filter: .eq("category", ...)
CREATE INDEX IF NOT EXISTS idx_listings_category
  ON public.listings(category);
