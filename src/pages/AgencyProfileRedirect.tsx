import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

/**
 * Legacy `/agency/profile/:agencyId` links (pre-Prompt-26) redirect here,
 * which resolves the id to the agency's slug and redirects to the
 * canonical `/agencies/:slug` route — never renders the profile itself.
 */
export default function AgencyProfileRedirect() {
  const { agencyId } = useParams<{ agencyId: string }>();
  const [slug, setSlug] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!agencyId) { setSlug(null); return; }
    supabase.from("agencies").select("slug").eq("id", agencyId).maybeSingle().then(({ data }) => {
      setSlug(data?.slug ?? null);
    });
  }, [agencyId]);

  if (slug === undefined) return null;
  if (slug === null) return <Navigate to="/activities" replace />;
  return <Navigate to={`/agencies/${slug}`} replace />;
}
