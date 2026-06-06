import { Star, ThumbsUp, BadgeCheck, MessageSquare } from "lucide-react";
import type { Review } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

interface ReviewCardProps {
  review: Review;
  /** When provided the agency can inline-edit their response to this review. */
  onRespond?: (reviewId: string, note: string) => Promise<void>;
}

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${sizeClass} ${
            star <= rating
              ? "fill-secondary text-secondary"
              : "fill-muted text-muted"
          }`}
        />
      ))}
    </div>
  );
}

export { StarRating };

const HELPFUL_KEY = "review_helpful_votes";

function getVotedReviews(): Set<string> {
  try {
    const raw = localStorage.getItem(HELPFUL_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markVoted(reviewId: string) {
  const voted = getVotedReviews();
  voted.add(reviewId);
  localStorage.setItem(HELPFUL_KEY, JSON.stringify([...voted]));
}

export function ReviewCard({ review, onRespond }: ReviewCardProps) {
  const [helpfulCount, setHelpfulCount] = useState(review.helpful);
  const [hasVoted, setHasVoted] = useState(() => getVotedReviews().has(review.id));
  const [showResponseEditor, setShowResponseEditor] = useState(false);
  const [responseText, setResponseText] = useState(review.adminNote ?? "");
  const [isSavingResponse, setIsSavingResponse] = useState(false);

  const handleSaveResponse = async () => {
    if (!onRespond) return;
    setIsSavingResponse(true);
    try {
      await onRespond(review.id, responseText);
      setShowResponseEditor(false);
    } finally {
      setIsSavingResponse(false);
    }
  };

  const handleHelpful = async () => {
    if (hasVoted) return;
    // Optimistic update
    setHelpfulCount((c) => c + 1);
    setHasVoted(true);
    markVoted(review.id);
    const { error } = await supabase.rpc("increment_helpful", { review_id: review.id });
    if (error) {
      await supabase.rpc("increment_review_helpful", { review_id: review.id });
    }
  };

  return (
    <div className="py-6 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary">
            {review.userName.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{review.userName}</span>
              {review.verified && (
                <span className="flex items-center gap-1 text-xs text-primary">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Verified
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              Traveled {review.tripDate}
            </span>
          </div>
        </div>
        <StarRating rating={review.rating} />
      </div>

      <h4 className="font-semibold mt-3">{review.title}</h4>
      <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
        {review.comment}
      </p>

      <div className="flex items-center gap-4 mt-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground gap-1.5"
          onClick={handleHelpful}
          disabled={hasVoted}
        >
          <ThumbsUp className={`h-3.5 w-3.5 ${hasVoted ? "fill-primary text-primary" : ""}`} />
          Helpful ({helpfulCount})
        </Button>
        <span className="text-xs text-muted-foreground">
          {new Date(review.date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </span>
        {onRespond && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground gap-1.5 ml-auto"
            onClick={() => setShowResponseEditor((v) => !v)}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {review.adminNote ? "Edit Response" : "Respond"}
          </Button>
        )}
      </div>

      {/* Agency response — always visible when it exists */}
      {review.adminNote && !showResponseEditor && (
        <div className="mt-4 pl-4 border-l-2 border-primary/30 bg-primary/5 rounded-r-lg p-3">
          <p className="text-xs font-semibold text-primary mb-1">Response from the Agency</p>
          <p className="text-sm text-foreground/80 leading-relaxed">{review.adminNote}</p>
        </div>
      )}

      {/* Inline response editor — only visible to agency */}
      {showResponseEditor && onRespond && (
        <div className="mt-4 space-y-2">
          <Textarea
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            placeholder="Write a public response to this review…"
            rows={3}
            disabled={isSavingResponse}
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setShowResponseEditor(false); setResponseText(review.adminNote ?? ""); }}
              disabled={isSavingResponse}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveResponse}
              disabled={isSavingResponse}
            >
              {isSavingResponse ? "Saving…" : responseText.trim() ? "Save Response" : "Remove Response"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
