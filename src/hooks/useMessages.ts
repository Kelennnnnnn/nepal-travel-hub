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
  agency_id: string;
  traveler_id: string | null;
  listing_id: string | null;
  booking_id: string | null;
  last_message_at: string | null;
  listing_title: string | null;
  last_message: string | null;
  unread_count: number;
  other_party_name: string;
  other_party_id: string | null;
}

type ConversationRow = {
  id: string;
  agency_id: string;
  traveler_id: string | null;
  listing_id: string | null;
  booking_id: string | null;
  last_message_at: string | null;
  listing: { title: string } | null;
};

type DisplayNameRow = { user_id: string; display_name: string; participant_role: string };

// ── Shared conversation-list loader ─────────────────────────────
//
// Both the traveler inbox and the agency inbox are just "conversations I'm
// a participant in" — conversation_participants rows are the only source of
// visibility now (audit C2: start_conversation() adds the traveler and
// every active accepted agency staff member as a participant at creation
// time), so there's one query shape for both, not a traveler_id/agency_id
// branch like the old (broken) version had.
async function fetchConversationsForUser(): Promise<Conversation[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: rows, error } = await supabase
    .from("conversation_participants")
    .select("participant_role, conversation:conversations(id, agency_id, traveler_id, listing_id, booking_id, last_message_at, listing:listings(title))")
    .eq("user_id", user.id);

  if (error || !rows?.length) return [];

  const memberships = rows
    .map((row) => ({
      myRole: row.participant_role as string,
      conv: row.conversation as unknown as ConversationRow | null,
    }))
    .filter((m): m is { myRole: string; conv: ConversationRow } => !!m.conv);

  if (!memberships.length) return [];

  const ids = memberships.map((m) => m.conv.id);

  const [{ data: recentMessages }, displayNameResults] = await Promise.all([
    supabase
      .from("messages")
      .select("conversation_id, content, sender_id, read_at, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false }),
    Promise.all(ids.map((id) => supabase.rpc("conversation_display_names", { p_conversation_id: id }))),
  ]);

  const namesByConversation = new Map<string, DisplayNameRow[]>(
    ids.map((id, i) => [id, (displayNameResults[i].data ?? []) as DisplayNameRow[]])
  );

  const conversations = memberships.map(({ myRole, conv }): Conversation => {
    const convMessages = (recentMessages ?? []).filter((m) => m.conversation_id === conv.id);
    const lastMsg = convMessages[0];
    const unread = convMessages.filter((m) => m.sender_id !== user.id && !m.read_at).length;
    const names = namesByConversation.get(conv.id) ?? [];
    const other = names.find((n) => n.user_id !== user.id) ?? names.find((n) => n.participant_role !== myRole);

    return {
      id: conv.id,
      agency_id: conv.agency_id,
      traveler_id: conv.traveler_id,
      listing_id: conv.listing_id,
      booking_id: conv.booking_id,
      last_message_at: conv.last_message_at,
      listing_title: conv.listing?.title ?? null,
      last_message: lastMsg?.content ?? null,
      unread_count: unread,
      other_party_name: other?.display_name ?? (myRole === "traveler" ? "Agency" : "Traveler"),
      other_party_id: other?.user_id ?? null,
    };
  });

  conversations.sort((a, b) => {
    if (!a.last_message_at && !b.last_message_at) return 0;
    if (!a.last_message_at) return 1;
    if (!b.last_message_at) return -1;
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
  });

  return conversations;
}

export function useTravelerConversations() {
  return useQuery({
    queryKey: ["conversations", "traveler"],
    queryFn: fetchConversationsForUser,
    staleTime: 30_000,
  });
}

export function useAgencyConversations() {
  return useQuery({
    queryKey: ["conversations", "agency"],
    queryFn: fetchConversationsForUser,
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

// ── Start (or reuse) a conversation with an agency ────────────
//
// The only client-side entry point for creating a conversation (audit C2):
// everything — the conversations row, the caller's own participant row, and
// every active accepted agency staff member's participant row — is created
// server-side by start_conversation(), which also validates the agency is
// actually publicly approved and the listing/booking (if given) really
// belong to it. Idempotent: calling this again with the same agency+listing
// returns the existing conversation id.
export function useStartConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      agencyId,
      listingId = null,
      bookingId = null,
      subject = null,
    }: {
      agencyId: string;
      listingId?: string | null;
      bookingId?: string | null;
      subject?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("start_conversation", {
        p_agency_id: agencyId,
        p_listing_id: listingId,
        p_booking_id: bookingId,
        p_subject: subject,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
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

      // messages_select_participant RLS already scopes visible rows to
      // conversations this user participates in — no need to first fetch
      // the conversation id list and IN-filter by hand.
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .is("read_at", null)
        .neq("sender_id", user.id);

      return count ?? 0;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
