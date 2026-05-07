-- Booking stats grouped by week (for line chart)
CREATE OR REPLACE FUNCTION public.admin_booking_stats(start_date DATE, end_date DATE)
RETURNS TABLE(
  period DATE,
  booking_count BIGINT,
  total_revenue NUMERIC,
  total_commission NUMERIC
) AS $$
  SELECT
    date_trunc('week', created_at)::DATE as period,
    COUNT(*) as booking_count,
    SUM(total_amount) as total_revenue,
    SUM(commission_amount) as total_commission
  FROM public.bookings
  WHERE created_at >= start_date AND created_at <= end_date
    AND payment_status = 'paid'
  GROUP BY period
  ORDER BY period;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Revenue grouped by month (for bar chart)
CREATE OR REPLACE FUNCTION public.admin_revenue_by_month(start_date DATE, end_date DATE)
RETURNS TABLE(
  period DATE,
  total_revenue NUMERIC,
  booking_count BIGINT
) AS $$
  SELECT
    date_trunc('month', created_at)::DATE as period,
    SUM(total_amount) as total_revenue,
    COUNT(*) as booking_count
  FROM public.bookings
  WHERE created_at >= start_date AND created_at <= end_date
    AND payment_status = 'paid'
  GROUP BY period
  ORDER BY period;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Agency sign-ups over time (for area chart)
CREATE OR REPLACE FUNCTION public.admin_agency_signups(start_date DATE, end_date DATE)
RETURNS TABLE(
  period DATE,
  new_applications BIGINT,
  cumulative BIGINT
) AS $$
  WITH weekly AS (
    SELECT
      date_trunc('week', created_at)::DATE as period,
      COUNT(*) as new_applications
    FROM public.agency_applications
    WHERE created_at >= start_date AND created_at <= end_date
    GROUP BY period
    ORDER BY period
  )
  SELECT
    period,
    new_applications,
    SUM(new_applications) OVER (ORDER BY period ROWS UNBOUNDED PRECEDING) as cumulative
  FROM weekly;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Booking count by listing category (for pie/donut chart)
CREATE OR REPLACE FUNCTION public.admin_bookings_by_category(start_date DATE, end_date DATE)
RETURNS TABLE(
  category TEXT,
  booking_count BIGINT,
  total_revenue NUMERIC
) AS $$
  SELECT
    COALESCE(l.category, 'Other') as category,
    COUNT(b.id) as booking_count,
    SUM(b.total_amount) as total_revenue
  FROM public.bookings b
  LEFT JOIN public.listings l ON l.id = b.listing_id
  WHERE b.created_at >= start_date AND b.created_at <= end_date
    AND b.payment_status = 'paid'
  GROUP BY l.category
  ORDER BY booking_count DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_booking_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revenue_by_month TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_agency_signups TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bookings_by_category TO authenticated;
