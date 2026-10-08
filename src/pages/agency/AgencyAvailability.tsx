import { useEffect, useMemo, useState } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, CalendarOff, Tag, PartyPopper, Lock, Loader2, Plus, PauseCircle } from "lucide-react";
import { toast } from "sonner";
import { useListingsStore, type ConfirmationMode, type PaymentRequirement } from "@/stores/listingsStore";
import { useDeparturesStore } from "@/stores/departuresStore";
import { useBookingRulesStore } from "@/stores/bookingRulesStore";
import { formatPrice } from "@/lib/currency";
import { supabase } from "@/lib/supabase";
import { useSeasonTemplates, resolveTemplateDates, type SeasonTemplate } from "@/hooks/useSeasonTemplates";
import { formatTripDate as formatDate } from "@/lib/dates";

const WEEKDAYS = [
  { iso: 1, label: "Mon" }, { iso: 2, label: "Tue" }, { iso: 3, label: "Wed" },
  { iso: 4, label: "Thu" }, { iso: 5, label: "Fri" }, { iso: 6, label: "Sat" }, { iso: 7, label: "Sun" },
];

export default function AgencyAvailability() {
  const { myListings, myAgencyId, fetchMyListings, updateBookingRules } = useListingsStore();
  const {
    seasonalPricing, isLoading,
    fetchSeasonalPricing, addSeasonalPricing, deleteSeasonalPricing,
  } = useDeparturesStore();
  const {
    blackoutPeriods, presets,
    fetchBlackoutPeriods, addBlackoutPeriod, deleteBlackoutPeriod, closeDate,
    fetchPresets, applyPreset,
  } = useBookingRulesStore();

  const [selectedListing, setSelectedListing] = useState("");
  const activeListing = useMemo(() => myListings.find((l) => l.id === selectedListing), [myListings, selectedListing]);

  const [rules, setRules] = useState({
    confirmation_mode: "instant" as ConfirmationMode,
    min_participants: 1,
    max_participants: 10,
    min_advance_hours: 24,
    max_advance_days: 365,
    default_start_time: "07:00",
    operating_days: null as number[] | null,
    daily_booking_limit: "" as string,
    no_show_grace_minutes: 30,
    payment_requirement: "fee_only" as PaymentRequirement,
    bookings_paused: false,
  });
  const [isSavingRules, setIsSavingRules] = useState(false);

  const [closeSingleDate, setCloseSingleDate] = useState("");
  const [closeSingleReason, setCloseSingleReason] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeReason, setRangeReason] = useState("");
  const [rangeAllListings, setRangeAllListings] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState("");
  const [isSavingBlackout, setIsSavingBlackout] = useState(false);

  const [agencyPaused, setAgencyPaused] = useState(false);
  const [agencyPauseSaving, setAgencyPauseSaving] = useState(false);

  const [seasonOpen, setSeasonOpen] = useState(false);
  const [seasonName, setSeasonName] = useState("");
  const [seasonStart, setSeasonStart] = useState("");
  const [seasonEnd, setSeasonEnd] = useState("");
  const [seasonPrice, setSeasonPrice] = useState("");
  const [isSavingSeason, setIsSavingSeason] = useState(false);
  const [appliedTemplate, setAppliedTemplate] = useState<SeasonTemplate | null>(null);
  const { data: seasonTemplates = [] } = useSeasonTemplates();

  useEffect(() => {
    if (myListings.length === 0) fetchMyListings();
    fetchPresets();
  }, [fetchMyListings, myListings.length, fetchPresets]);

  useEffect(() => {
    if (!selectedListing && myListings.length > 0) setSelectedListing(myListings[0].id);
  }, [myListings, selectedListing]);

  useEffect(() => {
    if (!selectedListing) return;
    fetchSeasonalPricing(selectedListing);
  }, [selectedListing, fetchSeasonalPricing]);

  useEffect(() => {
    if (myAgencyId) fetchBlackoutPeriods(myAgencyId);
  }, [myAgencyId, fetchBlackoutPeriods]);

  useEffect(() => {
    if (!myAgencyId) return;
    supabase.from("agencies").select("bookings_paused").eq("id", myAgencyId).maybeSingle().then(({ data }) => {
      if (data) setAgencyPaused(data.bookings_paused);
    });
  }, [myAgencyId]);

  const handleAgencyPauseToggle = async (checked: boolean) => {
    if (!myAgencyId) return;
    setAgencyPauseSaving(true);
    const { error } = await supabase.from("agencies").update({ bookings_paused: checked }).eq("id", myAgencyId);
    setAgencyPauseSaving(false);
    if (error) { toast.error(error.message); return; }
    setAgencyPaused(checked);
    toast.success(checked ? "All bookings paused agency-wide." : "Bookings resumed agency-wide.");
  };

  useEffect(() => {
    if (!activeListing) return;
    setRules({
      confirmation_mode: activeListing.confirmation_mode,
      min_participants: activeListing.min_participants,
      max_participants: activeListing.max_participants,
      min_advance_hours: activeListing.min_advance_hours,
      max_advance_days: activeListing.max_advance_days,
      default_start_time: activeListing.default_start_time?.slice(0, 5) ?? "07:00",
      operating_days: activeListing.operating_days,
      daily_booking_limit: activeListing.daily_booking_limit?.toString() ?? "",
      no_show_grace_minutes: activeListing.no_show_grace_minutes,
      payment_requirement: activeListing.payment_requirement,
      bookings_paused: activeListing.bookings_paused,
    });
  }, [activeListing]);

  const toggleOperatingDay = (iso: number) => {
    setRules((prev) => {
      const current = prev.operating_days ?? [1, 2, 3, 4, 5, 6, 7];
      const next = current.includes(iso) ? current.filter((d) => d !== iso) : [...current, iso].sort();
      return { ...prev, operating_days: next.length === 7 ? null : next };
    });
  };

  const handleSaveRules = async () => {
    if (!activeListing) return;
    if (rules.min_participants < 1 || rules.min_participants > rules.max_participants) {
      toast.error("Min group size must be at least 1 and no more than the max.");
      return;
    }
    setIsSavingRules(true);
    const { error } = await updateBookingRules(activeListing.id, {
      confirmation_mode: rules.confirmation_mode,
      min_participants: rules.min_participants,
      max_participants: rules.max_participants,
      min_advance_hours: rules.min_advance_hours,
      max_advance_days: rules.max_advance_days,
      default_start_time: rules.default_start_time,
      operating_days: rules.operating_days,
      daily_booking_limit: rules.daily_booking_limit === "" ? null : Number(rules.daily_booking_limit),
      no_show_grace_minutes: rules.no_show_grace_minutes,
      payment_requirement: rules.payment_requirement,
      bookings_paused: rules.bookings_paused,
    });
    setIsSavingRules(false);
    if (error) { toast.error(error); return; }
    toast.success("Booking rules saved.");
  };

  const handleCloseSingleDate = async () => {
    if (!activeListing || !closeSingleDate) return;
    setIsSavingBlackout(true);
    const { error } = await closeDate(activeListing.id, closeSingleDate, closeSingleReason || undefined);
    setIsSavingBlackout(false);
    if (error) { toast.error(error); return; }
    if (myAgencyId) fetchBlackoutPeriods(myAgencyId);
    toast.success("Date closed.");
    setCloseSingleDate("");
    setCloseSingleReason("");
  };

  const handleAddRange = async () => {
    if (!myAgencyId || !rangeStart || !rangeEnd) return;
    setIsSavingBlackout(true);
    const { error } = await addBlackoutPeriod({
      agency_id: myAgencyId,
      start_date: rangeStart,
      end_date: rangeEnd,
      reason: rangeReason || undefined,
      listing_ids: rangeAllListings ? null : (activeListing ? [activeListing.id] : null),
    });
    setIsSavingBlackout(false);
    if (error) { toast.error(error); return; }
    toast.success("Blackout period added.");
    setRangeStart(""); setRangeEnd(""); setRangeReason("");
  };

  const handleApplyPreset = async () => {
    if (!selectedPreset) return;
    setIsSavingBlackout(true);
    const { error } = await applyPreset(selectedPreset);
    setIsSavingBlackout(false);
    if (error) { toast.error(error); return; }
    if (myAgencyId) fetchBlackoutPeriods(myAgencyId);
    toast.success("Festival preset applied.");
    setSelectedPreset("");
  };

  // Defaults the price field to the listing's own base price — the
  // template's suggested_multiplier is offered as a one-click suggestion
  // (below) the agency can apply, never auto-applied. A plain multiplier
  // silently changing an agency's price was exactly the problem with the
  // old hardcoded SEASON_TEMPLATES.
  const applyTemplate = (tpl: SeasonTemplate) => {
    const { startDate, endDate } = resolveTemplateDates(tpl);
    setSeasonName(tpl.label);
    setSeasonStart(startDate);
    setSeasonEnd(endDate);
    setSeasonPrice(activeListing ? String(activeListing.base_price) : "");
    setAppliedTemplate(tpl);
  };

  const applySuggestedMultiplier = () => {
    if (!activeListing || !appliedTemplate?.suggested_multiplier) return;
    setSeasonPrice(String(Math.round(Number(activeListing.base_price) * appliedTemplate.suggested_multiplier)));
  };

  const handleAddSeason = async () => {
    if (!selectedListing || !seasonName || !seasonStart || !seasonEnd || !seasonPrice) {
      toast.error("Fill in all fields.");
      return;
    }
    setIsSavingSeason(true);
    const { error } = await addSeasonalPricing({
      listing_id: selectedListing,
      season_name: seasonName,
      start_date: seasonStart,
      end_date: seasonEnd,
      price: Number(seasonPrice),
    });
    setIsSavingSeason(false);
    if (error) { toast.error(error); return; }
    toast.success("Seasonal price added.");
    setSeasonOpen(false);
    setSeasonName(""); setSeasonStart(""); setSeasonEnd(""); setSeasonPrice("");
  };

  return (
    <AgencyLayout title="Availability & Booking Rules">
      <div className="space-y-6">
        <Card>
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <div className="flex items-center gap-3">
              <PauseCircle className="h-5 w-5 text-primary flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Pause bookings agency-wide</p>
                <p className="text-xs text-muted-foreground">Stops new bookings across every listing, instantly.</p>
              </div>
            </div>
            <Switch checked={agencyPaused} disabled={agencyPauseSaving} onCheckedChange={handleAgencyPauseToggle} />
          </CardContent>
        </Card>

        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="w-64">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Activity</Label>
            <Select value={selectedListing} onValueChange={setSelectedListing}>
              <SelectTrigger><SelectValue placeholder="Select a listing" /></SelectTrigger>
              <SelectContent>
                {myListings.map((l) => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!activeListing ? (
          <div className="text-center py-16 text-muted-foreground">
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : "Create a listing first to manage its booking rules."}
          </div>
        ) : (
          <>
            {/* Booking rules */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Booking Rules</CardTitle>
                {activeListing.restricted_area && (
                  <Badge variant="secondary" className="gap-1.5">
                    <Lock className="h-3 w-3" /> Restricted area
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Confirmation mode</Label>
                    <Select value={rules.confirmation_mode} onValueChange={(v: ConfirmationMode) => setRules((p) => ({ ...p, confirmation_mode: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instant">Instant — confirms automatically</SelectItem>
                        <SelectItem value="agency_confirm">Agency confirms each booking</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Default start time</Label>
                    <Input type="time" value={rules.default_start_time} onChange={(e) => setRules((p) => ({ ...p, default_start_time: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Minimum notice (hours)</Label>
                    <Input type="number" min={2} value={rules.min_advance_hours} onChange={(e) => setRules((p) => ({ ...p, min_advance_hours: Number(e.target.value) }))} />
                    {activeListing.restricted_area && <p className="text-xs text-muted-foreground">Restricted-area listings require at least 336 hours (14 days).</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Max advance booking (days)</Label>
                    <Input type="number" min={1} max={540} value={rules.max_advance_days} onChange={(e) => setRules((p) => ({ ...p, max_advance_days: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Min group size</Label>
                    <Input type="number" min={1} value={rules.min_participants} onChange={(e) => setRules((p) => ({ ...p, min_participants: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Max group size</Label>
                    <Input type="number" min={1} value={rules.max_participants} onChange={(e) => setRules((p) => ({ ...p, max_participants: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Daily booking limit</Label>
                    <Input type="number" min={1} placeholder="Unlimited" value={rules.daily_booking_limit} onChange={(e) => setRules((p) => ({ ...p, daily_booking_limit: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">No-show grace (minutes)</Label>
                    <Input type="number" min={15} max={60} value={rules.no_show_grace_minutes} onChange={(e) => setRules((p) => ({ ...p, no_show_grace_minutes: Number(e.target.value) }))} />
                  </div>
                  {Number(activeListing.duration_days) <= 1 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Payment requirement</Label>
                      <Select value={rules.payment_requirement} onValueChange={(v: PaymentRequirement) => setRules((p) => ({ ...p, payment_requirement: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fee_only">Reservation fee only</SelectItem>
                          <SelectItem value="full_online">Full price online</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Operating days</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((d) => {
                      const active = !rules.operating_days || rules.operating_days.includes(d.iso);
                      return (
                        <button
                          key={d.iso}
                          type="button"
                          onClick={() => toggleOperatingDay(d.iso)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            active ? "bg-primary/15 text-primary border-primary/50" : "bg-muted/40 text-muted-foreground border-border"
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">Every day selected = runs every day.</p>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                  <div>
                    <p className="text-sm font-medium">Pause bookings for this listing</p>
                    <p className="text-xs text-muted-foreground">Travelers will see it as unavailable until you resume.</p>
                  </div>
                  <Switch checked={rules.bookings_paused} onCheckedChange={(v) => setRules((p) => ({ ...p, bookings_paused: v }))} />
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSaveRules} disabled={isSavingRules}>
                    {isSavingRules ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Save Rules
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Blackout calendar */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarOff className="h-4 w-4 text-primary" /> Blackout Calendar</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Close a single date</Label>
                    <Input type="date" value={closeSingleDate} onChange={(e) => setCloseSingleDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-[160px]">
                    <Label className="text-xs">Reason (optional)</Label>
                    <Input value={closeSingleReason} onChange={(e) => setCloseSingleReason(e.target.value)} placeholder="e.g. Guide unavailable" />
                  </div>
                  <Button onClick={handleCloseSingleDate} disabled={!closeSingleDate || isSavingBlackout}>Close Date</Button>
                </div>

                <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-border/50">
                  <div className="space-y-1.5">
                    <Label className="text-xs">From</Label>
                    <Input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">To</Label>
                    <Input type="date" value={rangeEnd} min={rangeStart} onChange={(e) => setRangeEnd(e.target.value)} />
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-[160px]">
                    <Label className="text-xs">Reason (optional)</Label>
                    <Input value={rangeReason} onChange={(e) => setRangeReason(e.target.value)} placeholder="e.g. Dashain holiday" />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground pb-2.5">
                    <input type="checkbox" checked={rangeAllListings} onChange={(e) => setRangeAllListings(e.target.checked)} />
                    All my listings
                  </label>
                  <Button variant="outline" onClick={handleAddRange} disabled={!rangeStart || !rangeEnd || isSavingBlackout}>Add Range</Button>
                </div>

                <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-border/50">
                  <div className="space-y-1.5 min-w-[220px]">
                    <Label className="text-xs flex items-center gap-1.5"><PartyPopper className="h-3.5 w-3.5" /> Apply festival preset</Label>
                    <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                      <SelectTrigger><SelectValue placeholder="Select a festival" /></SelectTrigger>
                      <SelectContent>
                        {presets.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({formatDate(p.start_date)} – {formatDate(p.end_date)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" onClick={handleApplyPreset} disabled={!selectedPreset || isSavingBlackout}>Apply</Button>
                </div>

                {blackoutPeriods.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border/50">
                    {blackoutPeriods.map((b) => (
                      <div key={b.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/40">
                        <span>
                          {formatDate(b.start_date)} – {formatDate(b.end_date)}
                          {b.reason ? ` — ${b.reason}` : ""}
                          <span className="text-muted-foreground"> ({b.listing_ids ? `${b.listing_ids.length} listing${b.listing_ids.length === 1 ? "" : "s"}` : "all listings"})</span>
                        </span>
                        <button onClick={() => deleteBlackoutPeriod(b.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Seasonal pricing */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><Tag className="h-4 w-4 text-primary" /> Seasonal Pricing</CardTitle>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => setSeasonOpen((v) => !v)}>
                  <Plus className="h-4 w-4" /> Add Season
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {seasonalPricing.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No seasonal pricing rules yet — the base price applies year-round.</p>
                ) : (
                  <div className="space-y-2">
                    {seasonalPricing.map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/40">
                        <span>{s.season_name} <span className="text-muted-foreground">({formatDate(s.start_date)} – {formatDate(s.end_date)})</span></span>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">{formatPrice(Number(s.price))}</span>
                          <button onClick={() => deleteSeasonalPricing(s.id)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {seasonOpen && (
                  <div className="space-y-4 p-4 rounded-xl bg-muted/30 border border-border/50">
                    <div className="flex flex-wrap gap-1.5">
                      {seasonTemplates.map((tpl) => (
                        <button key={tpl.id} type="button" onClick={() => applyTemplate(tpl)}
                          className="px-2.5 py-1 rounded-full text-xs font-medium border bg-muted/40 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground">
                          {tpl.label}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Season name</Label>
                      <Input value={seasonName} onChange={(e) => setSeasonName(e.target.value)} placeholder="e.g. Autumn Peak" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Start date</Label>
                        <Input type="date" value={seasonStart} onChange={(e) => setSeasonStart(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>End date</Label>
                        <Input type="date" value={seasonEnd} onChange={(e) => setSeasonEnd(e.target.value)} min={seasonStart} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Price per person (NPR)</Label>
                      <Input type="number" min={0} step="0.01" value={seasonPrice} onChange={(e) => setSeasonPrice(e.target.value)} />
                      {appliedTemplate?.suggested_multiplier != null && (
                        <button
                          type="button"
                          onClick={applySuggestedMultiplier}
                          className="text-xs text-primary hover:underline"
                        >
                          Suggested for {appliedTemplate.label}: {appliedTemplate.suggested_multiplier}× base price — click to apply
                        </button>
                      )}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setSeasonOpen(false)}>Cancel</Button>
                      <Button onClick={handleAddSeason} disabled={isSavingSeason}>
                        {isSavingSeason ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Add
                      </Button>
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Note: which price actually applies to a given date (base vs. seasonal, when ranges overlap) is resolved at quote time — not shown live here yet.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AgencyLayout>
  );
}
