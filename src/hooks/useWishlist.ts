import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

// ── Fetch wishlist IDs ────────────────────────────────────────

export function useWishlistIds() {
  return useQuery({
    queryKey: ["wishlist"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Set<string>();

      const { data, error } = await supabase
        .from("wishlists")
        .select("listing_id")
        .eq("user_id", user.id);

      if (error) throw error;
      return new Set((data ?? []).map((r) => r.listing_id as string));
    },
    staleTime: 5 * 60_000,
  });
}

// ── Toggle wishlist ───────────────────────────────────────────
// Caller passes { listingId, isSaved } so we know the ORIGINAL state
// before any optimistic update has run.

export function useToggleWishlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listingId, isSaved }: { listingId: string; isSaved: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please log in to save activities.");

      if (isSaved) {
        const { error } = await supabase
          .from("wishlists")
          .delete()
          .eq("user_id", user.id)
          .eq("listing_id", listingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("wishlists")
          .insert({ user_id: user.id, listing_id: listingId });
        if (error) throw error;
      }

      return { listingId, removed: isSaved };
    },

    // Optimistic update — runs before mutationFn
    onMutate: async ({ listingId, isSaved }) => {
      await queryClient.cancelQueries({ queryKey: ["wishlist"] });
      const previous = queryClient.getQueryData<Set<string>>(["wishlist"]);

      queryClient.setQueryData<Set<string>>(["wishlist"], (old = new Set()) => {
        const next = new Set(old);
        if (isSaved) {
          next.delete(listingId);
        } else {
          next.add(listingId);
        }
        return next;
      });

      return { previous };
    },

    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["wishlist"], context.previous);
      }
      toast.error((err as Error).message);
    },

    onSuccess: ({ removed }) => {
      toast.success(removed ? "Removed from saved" : "Saved to wishlist");
    },
  });
}
