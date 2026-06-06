import { addDays, format } from "date-fns";
import { CalendarRange, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Listing } from "@/stores/listingsStore";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL_DOWS = [0, 1, 2, 3, 4, 5, 6];

function getDatesInRange(start: string, end: string, dows: number[]): string[] {
  if (!start || !end || !dows.length) return [];
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (s > e) return [];
  const result: string[] = [];
  let cur = s;
  while (cur <= e) {
    if (dows.includes(cur.getDay())) result.push(format(cur, "yyyy-MM-dd"));
    cur = addDays(cur, 1);
  }
  return result;
}

function DayToggle({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
        selected
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background border-border text-muted-foreground hover:border-foreground/60"
      }`}
    >
      {label}
    </button>
  );
}

export function DowPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {DOW_LABELS.map((d, i) => (
        <DayToggle
          key={d}
          label={d}
          selected={value.includes(i)}
          onToggle={() =>
            onChange(value.includes(i) ? value.filter(v => v !== i) : [...value, i])
          }
        />
      ))}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeListing: Listing | undefined;
  isSaving: boolean;
  bulkStart: string;
  bulkEnd: string;
  bulkDows: number[];
  bulkSpots: string;
  bulkPrice: string;
  bulkBlocked: boolean;
  setBulkStart: (v: string) => void;
  setBulkEnd: (v: string) => void;
  setBulkDows: (v: number[]) => void;
  setBulkSpots: (v: string) => void;
  setBulkPrice: (v: string) => void;
  setBulkBlocked: (v: boolean) => void;
  onApply: () => void;
}

export function BulkRangeDialog({
  open, onOpenChange, activeListing, isSaving,
  bulkStart, bulkEnd, bulkDows, bulkSpots, bulkPrice, bulkBlocked,
  setBulkStart, setBulkEnd, setBulkDows, setBulkSpots, setBulkPrice, setBulkBlocked,
  onApply,
}: Props) {
  const dateCount = bulkStart && bulkEnd && bulkDows.length > 0
    ? getDatesInRange(bulkStart, bulkEnd, bulkDows).length
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary" /> Bulk Date Range
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start date</Label>
              <Input type="date" value={bulkStart} onChange={e => setBulkStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End date</Label>
              <Input type="date" value={bulkEnd} onChange={e => setBulkEnd(e.target.value)} min={bulkStart} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Days of week to include</Label>
            <div className="flex items-center gap-2 mb-1.5">
              <button type="button" className="text-[11px] text-primary underline underline-offset-2"
                onClick={() => setBulkDows(ALL_DOWS)}>All</button>
              <span className="text-muted-foreground/40 text-xs">·</span>
              <button type="button" className="text-[11px] text-primary underline underline-offset-2"
                onClick={() => setBulkDows([1, 2, 3, 4, 5])}>Weekdays</button>
              <span className="text-muted-foreground/40 text-xs">·</span>
              <button type="button" className="text-[11px] text-primary underline underline-offset-2"
                onClick={() => setBulkDows([0, 6])}>Weekends</button>
            </div>
            <DowPicker value={bulkDows} onChange={setBulkDows} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Spots per date</Label>
              <Input
                type="number" min={1}
                value={bulkSpots}
                onChange={e => setBulkSpots(e.target.value)}
                placeholder={String(activeListing?.max_participants ?? 10)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Price override (optional)</Label>
              <Input
                type="number" min={0} step="0.01"
                value={bulkPrice}
                onChange={e => setBulkPrice(e.target.value)}
                placeholder="Default price"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={bulkBlocked} onCheckedChange={setBulkBlocked} id="bulk-blocked" />
            <Label htmlFor="bulk-blocked" className="text-sm cursor-pointer">
              Block all selected dates
            </Label>
          </div>

          <div className="pt-1">
            <p className="text-xs text-muted-foreground mb-3">
              {bulkStart && bulkEnd && bulkDows.length > 0
                ? `${dateCount} date(s) will be updated`
                : "Select a date range and days to see the count"}
            </p>
            <Button
              className="w-full"
              onClick={onApply}
              disabled={isSaving || !bulkStart || !bulkEnd || !bulkDows.length}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Apply to Range
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
