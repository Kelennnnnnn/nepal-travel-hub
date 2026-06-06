import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const DIFFICULTIES = ["Easy", "Moderate", "Challenging", "Difficult", "Expert"];

const DURATION_RANGES = [
  { value: "1",   label: "1 day" },
  { value: "2-3", label: "2-3 days" },
  { value: "4-7", label: "4-7 days" },
  { value: "8+",  label: "8+ days" },
];

interface FilterPanelProps {
  priceMinInput: string;
  priceMaxInput: string;
  difficulties: string[];
  durationRange: string;
  availableOnDate: string | undefined;
  setPriceMinInput: (v: string) => void;
  setPriceMaxInput: (v: string) => void;
  onApplyPrice: () => void;
  onToggleDifficulty: (d: string) => void;
  onDurationChange: (v: string) => void;
  onDateChange: (v: string | null) => void;
  onClearAll: () => void;
}

export function FilterPanel({
  priceMinInput, priceMaxInput, difficulties, durationRange, availableOnDate,
  setPriceMinInput, setPriceMaxInput, onApplyPrice,
  onToggleDifficulty, onDurationChange, onDateChange, onClearAll,
}: FilterPanelProps) {
  return (
    <div className="space-y-6">
      {/* Price Range */}
      <div>
        <Label className="text-sm font-semibold mb-3 block">Price Range (USD)</Label>
        <div className="flex gap-2 items-center">
          <Input
            type="number"
            placeholder="Min"
            value={priceMinInput}
            onChange={(e) => setPriceMinInput(e.target.value)}
            className="w-24"
            min={0}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            placeholder="Max"
            value={priceMaxInput}
            onChange={(e) => setPriceMaxInput(e.target.value)}
            className="w-24"
            min={0}
          />
          <Button size="sm" variant="outline" onClick={onApplyPrice}>Apply</Button>
        </div>
      </div>

      <Separator />

      {/* Difficulty */}
      <div>
        <Label className="text-sm font-semibold mb-3 block">Difficulty</Label>
        <div className="space-y-2">
          {DIFFICULTIES.map((d) => (
            <div key={d} className="flex items-center gap-2">
              <Checkbox
                id={`diff-${d}`}
                checked={difficulties.includes(d)}
                onCheckedChange={() => onToggleDifficulty(d)}
              />
              <label htmlFor={`diff-${d}`} className="text-sm cursor-pointer">{d}</label>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Duration */}
      <div>
        <Label className="text-sm font-semibold mb-3 block">Duration</Label>
        <Select
          value={durationRange}
          onValueChange={(value) => onDurationChange(value === "all" ? "" : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Any duration" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any duration</SelectItem>
            {DURATION_RANGES.map((range) => (
              <SelectItem key={range.value} value={range.value}>{range.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Available on Date */}
      <div>
        <Label className="text-sm font-semibold mb-3 block">Available On Date</Label>
        <Input
          type="date"
          value={availableOnDate || ""}
          min={new Date().toISOString().split("T")[0]}
          onChange={(e) => onDateChange(e.target.value || null)}
        />
        {availableOnDate && (
          <button onClick={() => onDateChange(null)} className="text-xs text-primary hover:underline mt-1">
            Clear date
          </button>
        )}
      </div>

      <Separator />

      <Button variant="outline" className="w-full" onClick={onClearAll}>
        Clear All Filters
      </Button>
    </div>
  );
}
