import { Star, ThumbsUp, BadgeCheck, MessageSquare } from "lucide-react";
import type { Review } from "@/lib/queries";
import { useToggleReviewHelpful } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

interface ReviewCardProps {
  review: Review;
  /** From useMyReviewVotes() — whether the signed-in user already voted this review helpful. */
  hasVoted: boolean;
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

export function ReviewCard({ review, hasVoted, onRespond }: ReviewCardProps) {
  const [showResponseEditor, setShowResponseEditor] = useState(false);
  const [responseText, setResponseText] = useState(review.agencyResponse ?? "");
  const [isSavingResponse, setIsSavingResponse] = useState(false);
  const toggleHelpful = useToggleReviewHelpful();

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

  const handleHelpful = () => {
    if (toggleHelpful.isPending) return;
    // No optimistic +1/-1 here — helpful_count is server-maintained
    // (recalc_review_helpful_count), and the mutation's onSuccess
    // invalidates the reviews query, which refetches the real count.
    toggleHelpful.mutate({ reviewId: review.id, listingId: review.activityId, hasVoted });
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
          disabled={toggleHelpful.isPending}
        >
          <ThumbsUp className={`h-3.5 w-3.5 ${hasVoted ? "fill-primary text-primary" : ""}`} />
          Helpful ({review.helpful})
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
            {review.agencyResponse ? "Edit Response" : "Respond"}
          </Button>
        )}
      </div>

      {/* Agency response — always visible when it exists */}
      {review.agencyResponse && !showResponseEditor && (
        <div className="mt-4 pl-4 border-l-2 border-primary/30 bg-primary/5 rounded-r-lg p-3">
          <p className="text-xs font-semibold text-primary mb-1">Response from the Agency</p>
          <p className="text-sm text-foreground/80 leading-relaxed">{review.agencyResponse}</p>
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
              onClick={() => { setShowResponseEditor(false); setResponseText(review.agencyResponse ?? ""); }}
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
