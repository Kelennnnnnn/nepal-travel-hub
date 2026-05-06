import { useState, useEffect, useRef } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Send, ArrowLeft, MessageSquare, Loader2,
  Search, Zap, ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  useAgencyConversations,
  useConversationMessages,
  useSendMessage,
  markConversationAsRead,
  type Conversation,
} from "@/hooks/useMessages";
import { useQueryClient } from "@tanstack/react-query";

// ─── Quick-reply templates ────────────────────────────────────────────────────

const QUICK_REPLIES = [
  "Thank you for your inquiry! I'd be happy to help.",
  "Yes, we have availability on those dates. Would you like to proceed?",
  "Could you please share your group size and preferred dates?",
  "The tour includes meals, accommodation, a guide, and all permits.",
  "A 30% deposit is required to confirm your booking.",
  "Our cancellation policy allows a full refund 7+ days before departure.",
  "I'll get back to you with more details within 24 hours.",
  "Gear and equipment are provided — no experience necessary.",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

// ─── ConversationItem ─────────────────────────────────────────────────────────

function ConversationItem({
  conv,
  selected,
  onClick,
}: {
  conv: Conversation;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors text-left border-b border-border",
        selected && "bg-primary/5 border-l-2 border-l-primary",
        conv.unread_count > 0 && !selected && "bg-muted/20",
      )}
    >
      <Avatar className="h-10 w-10 flex-shrink-0 mt-0.5">
        <AvatarFallback className={cn(
          "font-semibold text-sm",
          conv.unread_count > 0 ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
        )}>
          {initials(conv.other_party_name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className={cn("text-sm truncate", conv.unread_count > 0 ? "font-semibold" : "font-medium")}>
            {conv.other_party_name}
          </span>
          <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
            {formatTime(conv.last_message_at)}
          </span>
        </div>
        {conv.listing_title && (
          <p className="text-xs text-primary truncate mb-0.5">{conv.listing_title}</p>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className={cn(
            "text-xs truncate",
            conv.unread_count > 0 ? "text-foreground font-medium" : "text-muted-foreground",
          )}>
            {conv.last_message ?? "No messages yet"}
          </p>
          {conv.unread_count > 0 && (
            <Badge className="h-5 min-w-[20px] px-1 flex items-center justify-center text-xs bg-primary flex-shrink-0">
              {conv.unread_count}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── MessageThread ────────────────────────────────────────────────────────────

function MessageThread({
  conv,
  userId,
  onBack,
}: {
  conv: Conversation;
  userId: string;
  onBack: () => void;
}) {
  const { messages, isLoading } = useConversationMessages(conv.id);
  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const [draft, setDraft] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Mark as read on open
  useEffect(() => {
    void markConversationAsRead(conv.id, userId).then(() => {
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["conversations", "agency"] });
    });
  }, [conv.id, userId, queryClient]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!draft.trim() || isSending) return;
    sendMessage(
      { conversationId: conv.id, content: draft },
      {
        onSuccess: () => setDraft(""),
        onError: (err) => toast.error((err as Error).message),
      },
    );
  };

  const applyQuickReply = (text: string) => {
    setDraft(text);
    setQuickOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card flex-shrink-0">
        <button
          onClick={onBack}
          className="md:hidden text-muted-foreground hover:text-foreground flex-shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar className="h-9 w-9 flex-shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
            {initials(conv.other_party_name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight">{conv.other_party_name}</p>
          {conv.listing_title && (
            <a
              href={conv.listing_id ? `/activities/${conv.listing_id}` : undefined}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-0.5"
              onClick={(e) => !conv.listing_id && e.preventDefault()}
            >
              {conv.listing_title}
              {conv.listing_id && <ExternalLink className="h-3 w-3 ml-0.5" />}
            </a>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={cn("flex", i % 2 === 0 ? "justify-end" : "justify-start")}>
                <Skeleton className="h-10 w-48 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <MessageSquare className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">No messages yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Say hello or use a quick reply below.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.sender_id === userId;
            return (
              <div key={msg.id} className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] px-4 py-2.5 rounded-2xl text-sm",
                    isOwn
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm",
                  )}
                >
                  <p className="leading-relaxed">{msg.content}</p>
                  <p className={cn(
                    "text-[11px] mt-1",
                    isOwn ? "text-primary-foreground/60 text-right" : "text-muted-foreground",
                  )}>
                    {formatTime(msg.created_at)}
                    {isOwn && msg.read_at && (
                      <span className="ml-1.5">· Read</span>
                    )}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick-reply templates */}
      <div className="border-t border-border bg-card">
        <button
          type="button"
          onClick={() => setQuickOpen((v) => !v)}
          className="w-full flex items-center gap-1.5 px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="font-medium">Quick replies</span>
          {quickOpen
            ? <ChevronUp className="h-3.5 w-3.5 ml-auto" />
            : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
        </button>

        {quickOpen && (
          <div className="px-3 pb-2 flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
            {QUICK_REPLIES.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => applyQuickReply(text)}
                className="text-xs bg-muted hover:bg-primary/10 hover:text-primary border border-border hover:border-primary/30 rounded-full px-2.5 py-1 transition-colors text-left"
              >
                {text.length > 48 ? text.slice(0, 48) + "…" : text}
              </button>
            ))}
          </div>
        )}

        {/* Compose */}
        <div className="flex gap-2 px-4 pb-4 pt-1">
          <Input
            ref={inputRef}
            placeholder="Type a message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            disabled={isSending}
            className="flex-1"
          />
          <Button size="icon" onClick={handleSend} disabled={!draft.trim() || isSending}>
            {isSending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── AgencyMessages ───────────────────────────────────────────────────────────

export default function AgencyMessages() {
  const { data: conversations = [], isLoading } = useAgencyConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  // Real-time: refresh conversation list when last_message_at changes
  // (the DB trigger updates it on every new message from a traveler)
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`agency-convs:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `agency_id=eq.${userId}` },
        () => queryClient.invalidateQueries({ queryKey: ["conversations", "agency"] }),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, queryClient]);

  const filteredConversations = search.trim()
    ? conversations.filter((c) =>
        c.other_party_name.toLowerCase().includes(search.toLowerCase()) ||
        c.listing_title?.toLowerCase().includes(search.toLowerCase()),
      )
    : conversations;

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <AgencyLayout title="Messages">
      {/* Full-bleed layout — override AgencyLayout padding */}
      <div className="h-full flex overflow-hidden -m-6">

        {/* ── Left: conversation list ──────────────────────────── */}
        <div className={cn(
          "w-full md:w-80 lg:w-96 border-r border-border flex flex-col bg-card flex-shrink-0",
          selected && "hidden md:flex",
        )}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-border space-y-3 flex-shrink-0">
            <div className="flex items-center justify-between">
              <h1 className="font-bold text-base">Messages</h1>
              {totalUnread > 0 && (
                <Badge className="bg-primary text-primary-foreground text-xs px-2">
                  {totalUnread} unread
                </Badge>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search conversations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <MessageSquare className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
                <p className="font-medium mb-1 text-sm">
                  {search ? "No results" : "No messages yet"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {search
                    ? "Try a different name or listing title."
                    : "Traveler inquiries will appear here when they message you from an activity page."}
                </p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  selected={conv.id === selectedId}
                  onClick={() => setSelectedId(conv.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Right: thread ───────────────────────────────────── */}
        <div className={cn("flex-1 flex flex-col overflow-hidden", !selected && "hidden md:flex")}>
          {selected && userId ? (
            <MessageThread
              conv={selected}
              userId={userId}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <div className="hidden md:flex flex-col items-center justify-center h-full text-center px-8 gap-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-8 w-8 text-primary opacity-60" />
              </div>
              <div>
                <p className="text-base font-semibold mb-1">Select a conversation</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Choose a traveler inquiry from the left to read and respond.
                </p>
              </div>
              {totalUnread > 0 && (
                <p className="text-sm text-primary font-medium">
                  You have {totalUnread} unread message{totalUnread !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </AgencyLayout>
  );
}
