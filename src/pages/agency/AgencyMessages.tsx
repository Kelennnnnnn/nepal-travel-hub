import { useState, useEffect, useRef } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Send, ArrowLeft, MessageSquare, Loader2 } from "lucide-react";
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

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function ConversationItem({
  conv,
  selected,
  onClick,
}: {
  conv: Conversation;
  selected: boolean;
  onClick: () => void;
}) {
  const initials = conv.other_party_name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors text-left border-b border-border",
        selected && "bg-primary/5 border-l-2 border-l-primary"
      )}
    >
      <Avatar className="h-10 w-10 flex-shrink-0">
        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="font-medium text-sm truncate">{conv.other_party_name}</span>
          <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
            {formatTime(conv.last_message_at)}
          </span>
        </div>
        {conv.listing_title && (
          <p className="text-xs text-primary truncate mb-0.5">{conv.listing_title}</p>
        )}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground truncate">
            {conv.last_message ?? "No messages yet"}
          </p>
          {conv.unread_count > 0 && (
            <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs bg-primary flex-shrink-0">
              {conv.unread_count}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    void markConversationAsRead(conv.id, userId).then(() => {
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });
  }, [conv.id, userId, queryClient]);

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
      }
    );
  };

  const initials = conv.other_party_name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b border-border bg-card">
        <button onClick={onBack} className="md:hidden text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">{initials}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold text-sm">{conv.other_party_name}</p>
          {conv.listing_title && <p className="text-xs text-muted-foreground">{conv.listing_title}</p>}
        </div>
      </div>

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
            <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.sender_id === userId;
            return (
              <div key={msg.id} className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[75%] px-4 py-2.5 rounded-2xl text-sm",
                  isOwn
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                )}>
                  <p>{msg.content}</p>
                  <p className={cn("text-xs mt-1", isOwn ? "text-primary-foreground/70 text-right" : "text-muted-foreground")}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t border-border bg-card">
        <div className="flex gap-2">
          <Input
            placeholder="Type a message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            disabled={isSending}
            className="flex-1"
          />
          <Button size="icon" onClick={handleSend} disabled={!draft.trim() || isSending}>
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AgencyMessages() {
  const { data: conversations = [], isLoading } = useAgencyConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <AgencyLayout>
      <div className="h-full flex overflow-hidden -m-6">
        {/* Left */}
        <div className={cn(
          "w-full md:w-80 lg:w-96 border-r border-border flex flex-col bg-card flex-shrink-0",
          selected && "hidden md:flex"
        )}>
          <div className="p-4 border-b border-border">
            <h1 className="font-bold text-lg">Messages</h1>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="font-medium mb-1">No messages yet</p>
                <p className="text-sm text-muted-foreground">Traveler inquiries will appear here.</p>
              </div>
            ) : (
              conversations.map((conv) => (
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

        {/* Right */}
        <div className={cn("flex-1 flex flex-col", !selected && "hidden md:flex")}>
          {selected && userId ? (
            <MessageThread conv={selected} userId={userId} onBack={() => setSelectedId(null)} />
          ) : (
            <div className="hidden md:flex flex-col items-center justify-center h-full text-center px-8">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">Select a conversation</p>
              <p className="text-sm text-muted-foreground">Respond to traveler inquiries here.</p>
            </div>
          )}
        </div>
      </div>
    </AgencyLayout>
  );
}
