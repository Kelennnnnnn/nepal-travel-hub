import { addDays, format } from "date-fns";
import { Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DowPicker } from "./BulkRangeDialog";
import type { Listing } from "@/stores/listingsStore";

const SEASON_TEMPLATES = [
  { label: "Autumn Peak (Oct – Nov)", start: "10-01", end: "11-30", mult: 1.5 },
  { label: "Spring Peak (Mar – May)", start: "03-01", end: "05-31", mult: 1.4 },
  { label: "Winter (Dec – Feb)",      start: "12-01", end: "02-28", mult: 1.2 },
  { label: "Monsoon Off-Peak (Jun – Aug)", start: "06-01", end: "08-31", mult: 0.8 },
];

const fmt = new Intl.NumberFormat(undefined, {
  style: "currency", currency: "USD",
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeListing: Listing | undefined;
  isSaving: boolean;
  viewMonth: Date;
  // Form state
  seasonStart: string;
  seasonEnd: string;
  seasonDows: number[];
  seasonMode: "fixed" | "multiplier";
  seasonValue: string;
  seasonSpots: string;
  setSeasonStart: (v: string) => void;
  setSeasonEnd: (v: string) => void;
  setSeasonDows: (v: number[]) => void;
  setSeasonMode: (v: "fixed" | "multiplier") => void;
  setSeasonValue: (v: string) => void;
  setSeasonSpots: (v: string) => void;
  onApply: () => void;
}

export function SeasonalPricingDialog({
  open, onOpenChange, activeListing, isSaving, viewMonth,
  seasonStart, seasonEnd, seasonDows, seasonMode, seasonValue, seasonSpots,
  setSeasonStart, setSeasonEnd, setSeasonDows, setSeasonMode, setSeasonValue, setSeasonSpots,
  onApply,
}: Props) {
  const dateCount = seasonStart && seasonEnd && seasonDows.length > 0
    ? getDatesInRange(seasonStart, seasonEnd, seasonDows).length
    : 0;

  const applyTemplate = (idx: number) => {
    const t = SEASON_TEMPLATES[idx];
    const year = viewMonth.getFullYear();
    const endYear = t.end.startsWith("02") ? year + 1 : year;
    setSeasonStart(`${year}-${t.start}`);
    setSeasonEnd(`${endYear}-${t.end}`);
    if (seasonMode === "multiplier") setSeasonValue(String(t.mult));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" /> Set Peak / Seasonal Pricing
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Quick templates</Label>
            <div className="flex flex-wrap gap-1.5">
              {SEASON_TEMPLATES.map((t, i) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => applyTemplate(i)}
                  className="px-2.5 py-1 text-[11px] rounded-full border border-border hover:border-primary hover:text-primary transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start date</Label>
              <Input type="date" value={seasonStart} onChange={e => setSeasonStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End date</Label>
              <Input type="date" value={seasonEnd} onChange={e => setSeasonEnd(e.target.value)} min={seasonStart} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Days of week</Label>
            <DowPicker value={seasonDows} onChange={setSeasonDows} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Pricing mode</Label>
            <div className="flex gap-2">
              {(["multiplier", "fixed"] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSeasonMode(mode)}
                  className={cn(
                    "flex-1 py-1.5 rounded-md text-sm border transition-colors",
                    seasonMode === mode
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-foreground/40",
                  )}
                >
                  {mode === "multiplier" ? "Multiplier (e.g. 1.5×)" : "Fixed price"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">
                {seasonMode === "multiplier" ? "Multiplier (e.g. 1.5)" : "Fixed price ($)"}
              </Label>
              <Input
                type="number" min={0} step={seasonMode === "multiplier" ? "0.1" : "1"}
                value={seasonValue}
                onChange={e => setSeasonValue(e.target.value)}
                placeholder={seasonMode === "multiplier" ? "1.5" : "150"}
              />
              {seasonMode === "multiplier" && activeListing && seasonValue && (
                <p className="text-[11px] text-muted-foreground">
                  → {fmt.format(Math.round(activeListing.price * Number(seasonValue)))} per person
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Spots per date (optional)</Label>
              <Input
                type="number" min={1}
                value={seasonSpots}
                onChange={e => setSeasonSpots(e.target.value)}
                placeholder="Keep existing"
              />
            </div>
          </div>

          <div className="pt-1">
            <p className="text-xs text-muted-foreground mb-3">
              {seasonStart && seasonEnd && seasonDows.length > 0
                ? `${dateCount} date(s) will be updated`
                : "Select a date range to see the count"}
            </p>
            <Button
              className="w-full"
              onClick={onApply}
              disabled={isSaving || !seasonStart || !seasonEnd || !seasonValue || !seasonDows.length}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Apply Pricing
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
