-- ============================================================================
-- Into Nepal — migration 18 of N (Phase 4): agency_verification transition guard
--
-- PHASE_4_AGENCY_ONBOARDING.md. Every write to agency_verification.status
-- already goes through exactly one path — the review-agency-application /
-- agency-application edge functions, since RLS grants no direct UPDATE to
-- any client role (Phase 2). This trigger is defense-in-depth on top of
-- that: even a bug in either edge function's own logic cannot produce an
-- invalid transition, reusing the assert_valid_transition() helper built
-- for the bookings state machine (Phase 2) — same rationale, applied here
-- because the cost of adding it is small and the alternative (trusting
-- application code alone to never attempt an invalid transition) is
-- exactly the discipline that let AUDIT_REPORT.md PAY-01 happen.
-- ============================================================================

create or replace function public.guard_agency_verification_transition()
returns trigger
language plpgsql
as $$
begin
  perform public.assert_valid_transition('agency_verification.status', old.status, new.status, $j$
    {
      "draft":               ["submitted"],
      "submitted":           ["in_review", "more_info_required", "approved", "rejected"],
      "in_review":           ["more_info_required", "approved", "rejected"],
      "more_info_required":  ["submitted", "in_review"],
      "approved":            ["suspended"],
      "suspended":           ["approved"],
      "rejected":            ["submitted"]
    }
  $j$::jsonb);
  return new;
end;
$$;

drop trigger if exists guard_agency_verification_transition on public.agency_verification;
create trigger guard_agency_verification_transition
  before update of status on public.agency_verification
  for each row execute function public.guard_agency_verification_transition();
