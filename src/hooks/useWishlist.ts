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

export function useToggleWishlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (listingId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please log in to save activities.");

      // Check current state from cache
      const cached = queryClient.getQueryData<Set<string>>(["wishlist"]);
      const isSaved = cached?.has(listingId) ?? false;

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

    // Optimistic update
    onMutate: async (listingId) => {
      await queryClient.cancelQueries({ queryKey: ["wishlist"] });
      const previous = queryClient.getQueryData<Set<string>>(["wishlist"]);

      queryClient.setQueryData<Set<string>>(["wishlist"], (old = new Set()) => {
        const next = new Set(old);
        if (next.has(listingId)) {
          next.delete(listingId);
        } else {
          next.add(listingId);
        }
        return next;
      });

      return { previous };
    },

    onError: (err, _listingId, context) => {
      // Roll back on error
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
