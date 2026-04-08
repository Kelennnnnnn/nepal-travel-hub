import { useState } from "react";
import { Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useReviewsStore } from "@/stores/reviewsStore";

interface WriteReviewDialogProps {
  activityId: string;
  activityTitle: string;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function WriteReviewDialog({
  activityId,
  activityTitle,
  trigger,
  onSuccess,
}: WriteReviewDialogProps) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");

  const { submitReview, isSubmitting } = useReviewsStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }
    if (!title.trim()) {
      toast.error("Please add a title");
      return;
    }
    if (!comment.trim()) {
      toast.error("Please write your review");
      return;
    }

    // Resolve the eligible booking id at submit time
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("You must be signed in to submit a review");
      return;
    }

    const { data: bookings } = await supabase
      .from("bookings")
      .select("id")
      .eq("listing_id", activityId)
      .eq("traveler_id", user.id)
      .eq("status", "completed")
      .limit(1);

    const bookingId = bookings?.[0]?.id;
    if (!bookingId) {
      toast.error("No completed booking found for this activity");
      return;
    }

    const { error } = await submitReview({
      listingId: activityId,
      bookingId,
      rating,
      title: title.trim(),
      comment: comment.trim(),
    });

    if (error) {
      toast.error(error);
      return;
    }

    toast.success("Thank you! Your review has been submitted.");
    setOpen(false);
    setRating(0);
    setTitle("");
    setComment("");
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button variant="outline">Write a Review</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review: {activityTitle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Star Rating */}
          <div>
            <Label className="mb-2 block">Your Rating</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(star)}
                  className="p-0.5 transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-8 w-8 ${
                      star <= (hoverRating || rating)
                        ? "fill-secondary text-secondary"
                        : "fill-muted text-muted"
                    }`}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-sm text-muted-foreground mt-1">
                {["", "Poor", "Fair", "Good", "Very Good", "Excellent"][rating]}
              </p>
            )}
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="review-title">Review Title</Label>
            <Input
              id="review-title"
              placeholder="Summarize your experience"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
          </div>

          {/* Comment */}
          <div>
            <Label htmlFor="review-comment">Your Experience</Label>
            <Textarea
              id="review-comment"
              placeholder="Tell other travelers about your experience..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={5}
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {comment.length}/1000
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Submitting…" : "Submit Review"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
