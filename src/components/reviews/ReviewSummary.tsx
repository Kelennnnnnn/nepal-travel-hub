import { Star } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface ReviewSummaryProps {
  average: number;
  count: number;
  distribution: number[];
}

export function ReviewSummary({ average, count, distribution }: ReviewSummaryProps) {
  const labels = ["5 stars", "4 stars", "3 stars", "2 stars", "1 star"];
  const reversedDist = [...distribution].reverse();

  return (
    <div className="flex flex-col sm:flex-row gap-8">
      {/* Overall Score */}
      <div className="flex flex-col items-center justify-center text-center min-w-[140px]">
        <span className="text-5xl font-bold">{average.toFixed(1)}</span>
        <div className="flex gap-0.5 mt-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={`h-5 w-5 ${
                star <= Math.round(average)
                  ? "fill-secondary text-secondary"
                  : "fill-muted text-muted"
              }`}
            />
          ))}
        </div>
        <span className="text-sm text-muted-foreground mt-1">
          {count} review{count !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Distribution Bars */}
      <div className="flex-1 space-y-2">
        {labels.map((label, i) => {
          const value = reversedDist[i] || 0;
          const pct = count > 0 ? (value / count) * 100 : 0;
          return (
            <div key={label} className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground w-16 text-right">{label}</span>
              <Progress value={pct} className="h-2 flex-1" />
              <span className="text-sm text-muted-foreground w-8">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
