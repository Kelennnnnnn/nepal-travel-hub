import { Star, ThumbsUp, BadgeCheck } from "lucide-react";
import { Review } from "@/stores/reviewsStore";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface ReviewCardProps {
  review: Review;
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

export function ReviewCard({ review }: ReviewCardProps) {
  const [helpfulCount, setHelpfulCount] = useState(review.helpful);
  const [hasVoted, setHasVoted] = useState(false);

  const handleHelpful = () => {
    if (hasVoted) return;
    setHelpfulCount((c) => c + 1);
    setHasVoted(true);
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
      </div>
    </div>
  );
}
