import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  traveler_id: string;
  agency_id: string;
  listing_id: string | null;
  last_message_at: string;
  listing_title: string | null;
  last_message: string | null;
  unread_count: number;
  other_party_name: string;
  other_party_id: string;
}

// ── Traveler conversations ────────────────────────────────────

export function useTravelerConversations() {
  return useQuery({
    queryKey: ["conversations", "traveler"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: convs, error } = await supabase
        .from("conversations")
        .select("id, traveler_id, agency_id, listing_id, last_message_at, listing:listings(title)")
        .eq("traveler_id", user.id)
        .order("last_message_at", { ascending: false });

      if (error || !convs?.length) return [];

      // Resolve agency names
      const agencyIds = [...new Set(convs.map((c) => c.agency_id))];
      const [{ data: agencies }, { data: recentMessages }] = await Promise.all([
        supabase
          .from("agency_applications")
          .select("user_id, company_name")
          .in("user_id", agencyIds),
        supabase
          .from("messages")
          .select("conversation_id, content, sender_id, read_at")
          .in("conversation_id", convs.map((c) => c.id))
          .order("created_at", { ascending: false }),
      ]);

      const agencyMap = new Map((agencies ?? []).map((a) => [a.user_id, a.company_name]));

      return convs.map((conv): Conversation => {
        const convMessages = (recentMessages ?? []).filter((m) => m.conversation_id === conv.id);
        const lastMsg = convMessages[0];
        const unread = convMessages.filter((m) => m.sender_id !== user.id && !m.read_at).length;
        return {
          id: conv.id,
          traveler_id: conv.traveler_id,
          agency_id: conv.agency_id,
          listing_id: conv.listing_id,
          last_message_at: conv.last_message_at,
          listing_title: (conv.listing as { title: string } | null)?.title ?? null,
          last_message: lastMsg?.content ?? null,
          unread_count: unread,
          other_party_name: agencyMap.get(conv.agency_id) ?? "Agency",
          other_party_id: conv.agency_id,
        };
      });
    },
    staleTime: 30_000,
  });
}

// ── Agency conversations ──────────────────────────────────────

export function useAgencyConversations() {
  return useQuery({
    queryKey: ["conversations", "agency"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: convs, error } = await supabase
        .from("conversations")
        .select("id, traveler_id, agency_id, listing_id, last_message_at, listing:listings(title)")
        .eq("agency_id", user.id)
        .order("last_message_at", { ascending: false });

      if (error || !convs?.length) return [];

      const travelerIds = [...new Set(convs.map((c) => c.traveler_id))];
      const [{ data: displayNames }, { data: recentMessages }] = await Promise.all([
        supabase.rpc("get_user_display_names", { user_ids: travelerIds }),
        supabase
          .from("messages")
          .select("conversation_id, content, sender_id, read_at")
          .in("conversation_id", convs.map((c) => c.id))
          .order("created_at", { ascending: false }),
      ]);

      const nameMap = new Map(
        (displayNames as { id: string; display_name: string }[] ?? []).map((u) => [u.id, u.display_name])
      );

      return convs.map((conv): Conversation => {
        const convMessages = (recentMessages ?? []).filter((m) => m.conversation_id === conv.id);
        const lastMsg = convMessages[0];
        const unread = convMessages.filter((m) => m.sender_id !== user.id && !m.read_at).length;
        return {
          id: conv.id,
          traveler_id: conv.traveler_id,
          agency_id: conv.agency_id,
          listing_id: conv.listing_id,
          last_message_at: conv.last_message_at,
          listing_title: (conv.listing as { title: string } | null)?.title ?? null,
          last_message: lastMsg?.content ?? null,
          unread_count: unread,
          other_party_name: nameMap.get(conv.traveler_id) ?? "Traveler",
          other_party_id: conv.traveler_id,
        };
      });
    },
    staleTime: 30_000,
  });
}

// ── Messages for a conversation (with real-time) ──────────────

export function useConversationMessages(conversationId: string | null) {
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
    enabled: !!conversationId,
    staleTime: 0,
  });

  // Real-time subscription
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          queryClient.setQueryData<Message[]>(["messages", conversationId], (old = []) => {
            // Avoid duplicates
            if (old.find((m) => m.id === (payload.new as Message).id)) return old;
            return [...old, payload.new as Message];
          });
          // Refresh conversation list to update last_message
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return { messages, isLoading };
}

// ── Send message ──────────────────────────────────────────────

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("messages")
        .insert({ conversation_id: conversationId, sender_id: user.id, content: content.trim() })
        .select()
        .single();

      if (error) throw error;
      return data as Message;
    },
    onSuccess: (msg) => {
      // Optimistically add to thread (real-time will deduplicate)
      queryClient.setQueryData<Message[]>(["messages", msg.conversation_id], (old = []) => {
        if (old.find((m) => m.id === msg.id)) return old;
        return [...old, msg];
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

// ── Mark messages as read ─────────────────────────────────────

export async function markConversationAsRead(conversationId: string, userId: string) {
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .is("read_at", null)
    .neq("sender_id", userId);
}

// ── Total unread count (for header badge) ─────────────────────

export function useUnreadCount() {
  return useQuery({
    queryKey: ["unread-count"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      // Get user's conversations
      const role = user.user_metadata?.role;
      const field = role === "agency" ? "agency_id" : "traveler_id";

      const { data: convs } = await supabase
        .from("conversations")
        .select("id")
        .eq(field, user.id);

      if (!convs?.length) return 0;

      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", convs.map((c) => c.id))
        .is("read_at", null)
        .neq("sender_id", user.id);

      return count ?? 0;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ── Create or find conversation + send first message ──────────

export async function startConversation({
  travelerId,
  agencyId,
  listingId,
  content,
}: {
  travelerId: string;
  agencyId: string;
  listingId: string;
  content: string;
}): Promise<{ conversationId: string }> {
  const { data: existing, error: findError } = await supabase
    .from("conversations")
    .select("id")
    .eq("traveler_id", travelerId)
    .eq("agency_id", agencyId)
    .eq("listing_id", listingId)
    .maybeSingle();

  if (findError) throw findError;

  let conversationId = existing?.id;

  if (!conversationId) {
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .insert({ traveler_id: travelerId, agency_id: agencyId, listing_id: listingId })
      .select("id")
      .single();

    if (convError || !conv) throw convError ?? new Error("Failed to create conversation");
    conversationId = conv.id;
  }

  // Insert message
  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: travelerId,
    content: content.trim(),
  });

  if (msgError) throw msgError;

  return { conversationId };
}
