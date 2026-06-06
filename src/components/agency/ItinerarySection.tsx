import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface ItineraryDay {
  day: number;
  title: string;
  description: string;
}

interface Props {
  itinerary: ItineraryDay[];
  isLoading: boolean;
  onAdd: () => void;
  onUpdate: (index: number, field: "title" | "description", value: string) => void;
  onRemove: (index: number) => void;
}

export function ItinerarySection({ itinerary, isLoading, onAdd, onUpdate, onRemove }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Itinerary</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Each click adds the next day in sequence</p>
        </div>
        <Button variant="outline" size="sm" onClick={onAdd} className="gap-1.5" disabled={isLoading}>
          <Plus className="h-4 w-4" />
          {itinerary.length === 0 ? "Add Day 1" : `Add Day ${itinerary.length + 1}`}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {itinerary.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">
            Click "Add Day 1" to start building your itinerary.
          </p>
        )}
        {itinerary.map((day, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                {day.day}
              </div>
              {i < itinerary.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
            </div>
            <div className="flex-1 pb-3">
              <p className="text-sm font-semibold mb-1.5">Day {day.day}</p>
              <Textarea
                placeholder={`Describe what happens on Day ${day.day}…`}
                rows={3}
                value={day.description}
                onChange={(e) => onUpdate(i, "description", e.target.value)}
                disabled={isLoading}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground flex-shrink-0 mt-6"
              onClick={() => onRemove(i)}
              disabled={isLoading}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
