-- ============================================================================
-- Into Nepal — Phase 5: Listing management and moderation
--
-- Closes a real authorization gap found during this phase's own forensic
-- pass (the same discipline that found the has_agency_access()/
-- conversation_participants recursion bugs in Phase 4): migration 4's
-- "listings_staff_manage_own" RLS policy is a blanket FOR ALL grant with no
-- restriction on which status VALUES an agency may write. RLS alone can
-- express "does this row belong to you", never "which old->new status pairs
-- are you allowed to cause" — that needs a trigger with access to both OLD
-- and NEW, which is exactly what agency_verification's design (Phase 4)
-- already established the codebase's precedent for.
--
-- Left unfixed, an agency could set a brand-new draft listing's status
-- straight to 'approved' or 'published' via a single client-side UPDATE,
-- bypassing admin moderation entirely — reintroducing, on the listings
-- table, the exact class of "let agency approve itself" bug PHASE_0_
-- FORENSIC_AUDIT.md documented and Phase 2/4 deliberately closed for
-- agency_verification (see migration 3's own comment: "target §66/§22:
-- 'let agency approve itself' — NEVER").
--
-- Design: reuse assert_valid_transition() (migration 7) for the pure
-- data-integrity question ("is old->new a real edge in the graph at all"),
-- and add a second, narrower check inside the same trigger for the
-- authorization question ("does entering this specific state require admin
-- authority") — a deliberately different shape from agency_verification's
-- "no UPDATE grant for staff at all", because here staff legitimately need
-- direct write access to the row for many self-service transitions (submit
-- for review, publish once approved, pause/unpause, archive), and forcing
-- ALL of those through an edge function would be unnecessary overhead for
-- what are otherwise safe, ordinary owner actions.
-- ============================================================================

create or replace function public.guard_listing_status_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- listings_staff_manage_own is FOR ALL with no column-value restriction,
    -- so without this, an agency could INSERT a brand-new row with
    -- status='published' directly, skipping moderation entirely — the
    -- transition-graph check below only ever fires on UPDATE and would
    -- never catch this. A non-admin may only create a row that starts in
    -- draft or pending_review; an admin (e.g. seeding/importing) is exempt.
    if new.status not in ('draft', 'pending_review') and not public.is_admin() then
      raise exception 'INSUFFICIENT_PRIVILEGE: cannot create a listing with status %', new.status
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- approved/published/paused can all go back to pending_review: an agency
  -- editing a live listing's content should be able to route the change
  -- back through moderation rather than the edit taking effect unreviewed
  -- (prevents "get approved with compliant content, then edit to something
  -- that wouldn't have been approved").
  perform public.assert_valid_transition('listing_status', old.status, new.status, $j$
    {
      "draft":           ["pending_review", "archived"],
      "pending_review":  ["approved", "rejected", "draft"],
      "approved":        ["published", "archived", "pending_review"],
      "published":       ["paused", "archived", "pending_review"],
      "paused":          ["published", "archived", "pending_review"],
      "rejected":        ["pending_review", "archived"],
      "archived":        []
    }
  $j$::jsonb);

  -- Authorization layer: entering 'approved' or 'rejected' is an admin
  -- moderation decision, never something the owning agency may cause
  -- itself, regardless of what the graph above permits structurally.
  if new.status is distinct from old.status
     and new.status in ('approved', 'rejected')
     and not public.is_admin() then
    raise exception 'INSUFFICIENT_PRIVILEGE: only an admin may set listing status to %', new.status
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_listing_status_transition() is
  'Enforces the listing status state machine AND that only an admin may cause a transition into approved/rejected — the actual moderation decision. Also gates the INITIAL status on INSERT (see TG_OP branch) so a non-admin cannot create a listing already published, which the UPDATE-only graph check alone would never catch. Everything else (submit for review, publish once approved, pause/unpause, archive, resubmit after rejection) is legitimate self-service and left to the existing has_agency_access(agency_id, ''manager'') RLS grant.';

create trigger guard_listing_status_transition
  before insert or update of status on public.listings
  for each row execute function public.guard_listing_status_transition();

-- ── Protect admin-only fields from being set via the agency's own broad
--    UPDATE grant (listings_staff_manage_own is FOR ALL / all columns) ──────

create or replace function public.guard_listing_protected_fields()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Same reasoning as guard_listing_status_transition's INSERT branch:
    -- listings_staff_manage_own has no column-value restriction, so without
    -- this a non-admin could INSERT a brand-new row with featured=true
    -- directly, self-granting placement the UPDATE-only re-pin below would
    -- never catch (there is no old.featured to re-pin to on a first insert).
    new.featured := false;
    return new;
  end if;

  -- Silently re-pin rather than raise: matches the lock_message_content()
  -- pattern (migration 13) — an agency's UPDATE touching unrelated fields
  -- (title, price, images, ...) should still succeed; only the protected
  -- field itself is prevented from changing via this path, not the whole
  -- request. featured is an editorial decision (homepage curation), not
  -- something a listing's own owner can grant itself for free promotion —
  -- unlike the old system's self-service "Request Featured Placement"
  -- checkbox, which this deliberately does not carry forward.
  new.featured := old.featured;
  return new;
end;
$$;

comment on function public.guard_listing_protected_fields() is
  'Non-admins can never set featured=true, on INSERT or UPDATE — re-pinned to false/old value respectively. Runs on every listing write (not just status changes), since listings_staff_manage_own grants agency staff write access to the whole row.';

create trigger guard_listing_protected_fields
  before insert or update on public.listings
  for each row execute function public.guard_listing_protected_fields();
