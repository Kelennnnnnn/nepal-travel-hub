import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReviewCard } from "./ReviewCard";
import { ReviewSummary } from "./ReviewSummary";
import { WriteReviewDialog } from "./WriteReviewDialog";
import { useCanReviewListing, useListingReviews, type Review } from "@/lib/queries";

interface ReviewsSectionProps {
  activityId: string;
  activityTitle: string;
}

function computeSummary(reviews: Review[]) {
  if (reviews.length === 0) return { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] };
  const distribution = [0, 0, 0, 0, 0];
  let total = 0;
  reviews.forEach((r) => {
    total += r.rating;
    distribution[r.rating - 1]++;
  });
  return { average: total / reviews.length, count: reviews.length, distribution };
}

export function ReviewsSection({ activityId, activityTitle }: ReviewsSectionProps) {
  const [sortBy, setSortBy] = useState("newest");
  const { data: reviews = [], isLoading } = useListingReviews(activityId);
  const { data: canReview = false } = useCanReviewListing(activityId);

  const { average, count, distribution } = computeSummary(reviews);

  const sortedReviews = [...reviews].sort((a: Review, b: Review) => {
    if (sortBy === "newest") return new Date(b.date).getTime() - new Date(a.date).getTime();
    if (sortBy === "highest") return b.rating - a.rating;
    if (sortBy === "helpful") return b.helpful - a.helpful;
    return 0;
  });

  const writeReviewButton = canReview ? (
    <WriteReviewDialog
      activityId={activityId}
      activityTitle={activityTitle}
      trigger={<Button>Write a Review</Button>}
    />
  ) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Reviews & Ratings
        </h2>
        {writeReviewButton}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading reviews…</div>
      ) : count > 0 ? (
        <>
          <ReviewSummary average={average} count={count} distribution={distribution} />

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <span className="text-sm text-muted-foreground">
              Showing {sortedReviews.length} review{sortedReviews.length !== 1 ? "s" : ""}
            </span>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Most Recent</SelectItem>
                <SelectItem value="highest">Highest Rated</SelectItem>
                <SelectItem value="helpful">Most Helpful</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            {sortedReviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-12 bg-muted/30 rounded-xl">
          <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium mb-1">No reviews yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Be the first to share your experience!
          </p>
          {canReview && (
            <WriteReviewDialog
              activityId={activityId}
              activityTitle={activityTitle}
              trigger={<Button variant="outline">Write a Review</Button>}
            />
          )}
        </div>
      )}
    </div>
  );
}
