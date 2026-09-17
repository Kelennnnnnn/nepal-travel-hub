import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Plus, X, Save, Loader2, Eye, Check, Send } from "lucide-react";
import { ItinerarySection } from "@/components/agency/ItinerarySection";
import { ImageUploader } from "@/components/uploads/ImageUploader";
import { ListingPreviewDialog } from "@/components/agency/ListingPreviewDialog";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useListingsStore } from "@/stores/listingsStore";
import { useAuthStore } from "@/stores/authStore";
import type { ListingStatus } from "@/stores/listingsStore";
import { listingFormSchema, type ListingFormData } from "@/lib/validations";

const categories = ["Trekking", "Adventure", "Cultural", "Wildlife", "Rafting", "Mountaineering", "Wellness", "Photography"];
const difficulties = ["Easy", "Moderate", "Challenging", "Difficult", "Expert"];
const locations = ["Kathmandu", "Pokhara", "Solukhumbu", "Annapurna Region", "Chitwan", "Langtang", "Mustang", "Sindhupalchok"];

const INCLUDE_PRESETS = [
  "Accommodation", "Breakfast", "Lunch", "Dinner", "Meals",
  "Guide", "Porter", "Transport", "Permits", "Equipment",
  "Insurance", "Airport Transfer", "Tea House", "Camping", "Oxygen",
];

const EXCLUDE_PRESETS = [
  "Flights", "Visa Fees", "Tips", "Personal Expenses",
  "Travel Insurance", "Alcohol", "Snacks", "Laundry", "Gear Rental",
];

import type { ItineraryDay } from "@/components/agency/ItinerarySection";

function extFromMime(mime: string): string {
  const part = mime.split("/")[1];
  return part ? part.split("+")[0] : "png";
}

async function dataUriToBlob(dataUri: string): Promise<Blob> {
  const res = await fetch(dataUri);
  return res.blob();
}

export default function AgencyListingForm() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const { createListing, updateListing, uploadListingImage, fetchMyListings, myListings } = useListingsStore();
  const { user } = useAuthStore();

  const [itinerary, setItinerary] = useState<ItineraryDay[]>([]);
  const [newInclude, setNewInclude] = useState("");
  const [newExclude, setNewExclude] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingEdit, setIsFetchingEdit] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Status the listing had when loaded for editing — determines whether
  // saving should route the listing back through moderation (see
  // primaryAction below) and which secondary actions make sense.
  const [originalStatus, setOriginalStatus] = useState<ListingStatus | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    getValues,
    formState: { errors },
  } = useForm<ListingFormData>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: {
      title: "",
      description: "",
      location: "",
      duration_label: "",
      duration_days: 1,
      max_participants: 10,
      images: [],
      includes: [],
      excludes: [],
    },
  });

  const images = watch("images");
  const includes = watch("includes");
  const excludes = watch("excludes");

  // Populate form when editing
  useEffect(() => {
    if (!isEditing || !id) return;

    const populate = async () => {
      setIsFetchingEdit(true);
      if (myListings.length === 0) await fetchMyListings();

      const listing = useListingsStore.getState().myListings.find((l) => l.id === id);
      if (listing) {
        reset({
          title: listing.title,
          description: listing.description,
          category: listing.category,
          location: listing.location,
          base_price: Number(listing.base_price),
          duration_label: listing.duration_label,
          duration_days: Number(listing.duration_days),
          max_participants: listing.max_participants,
          difficulty: listing.difficulty ?? undefined,
          images: listing.images ?? [],
          includes: listing.includes ?? [],
          excludes: listing.excludes ?? [],
        });
        setOriginalStatus(listing.status);
        setItinerary(listing.itinerary ?? []);
      } else {
        toast.error("Listing not found.");
        navigate("/agency/listings");
      }
      setIsFetchingEdit(false);
    };

    populate();
  }, [id, isEditing]);

  const addInclude = () => {
    if (newInclude.trim()) {
      setValue("includes", [...includes, newInclude.trim()], { shouldValidate: true });
      setNewInclude("");
    }
  };

  const addExclude = () => {
    if (newExclude.trim()) {
      setValue("excludes", [...excludes, newExclude.trim()], { shouldValidate: true });
      setNewExclude("");
    }
  };

  const addDay = () => setItinerary([...itinerary, { day: itinerary.length + 1, title: `Day ${itinerary.length + 1}`, description: "" }]);
  const updateDay = (i: number, field: "title" | "description", val: string) =>
    setItinerary((prev) => prev.map((d, j) => j === i ? { ...d, [field]: val } : d));
  const removeDay = (i: number) =>
    setItinerary((prev) => prev.filter((_, j) => j !== i).map((d, j) => ({ ...d, day: j + 1 })));

  // Uploads any staged data: URI images to the listing-images bucket (path
  // <agency_id>/<listing_id>/<uuid>.<ext>, per supabase/migrations/
  // 20260916000016_storage_buckets.sql) and inserts the matching
  // listing_images metadata row for each. Already-uploaded http(s) URLs
  // (from a prior save) pass through unchanged.
  const uploadStagedImages = async (listingId: string, agencyId: string, imageList: string[]): Promise<string[]> => {
    const result: string[] = [];
    for (const img of imageList) {
      if (!img.startsWith("data:")) { result.push(img); continue; }
      const blob = await dataUriToBlob(img);
      const ext = extFromMime(blob.type);
      const { url, error } = await uploadListingImage(listingId, agencyId, blob, ext);
      if (error || !url) { toast.error(`Failed to upload an image: ${error ?? "unknown error"}`); continue; }
      result.push(url);
    }
    return result;
  };

  // What the primary action button does depends on the listing's CURRENT
  // status — the database (guard_listing_status_transition) is the actual
  // source of truth for which transitions are legal; this just picks a
  // sensible default target and label per PHASE_5's design (see migration
  // 20260917000002_listing_moderation.sql's comment on why published/
  // paused/approved route back through pending_review on edit).
  const primaryAction = ((): { label: string; targetStatus: ListingStatus | null } => {
    if (!isEditing) return { label: "Submit for Review", targetStatus: "pending_review" };
    switch (originalStatus) {
      case "draft":
      case "rejected":
        return { label: "Submit for Review", targetStatus: "pending_review" };
      case "published":
      case "paused":
        return { label: "Submit Changes for Review", targetStatus: "pending_review" };
      case "pending_review":
      case "approved":
      default:
        return { label: "Save Changes", targetStatus: null };
    }
  })();

  const doSave = async (data: ListingFormData, targetStatus: ListingStatus | null) => {
    setIsLoading(true);
    try {
      const basePayload = {
        title: data.title.trim(),
        description: data.description.trim(),
        category: data.category,
        location: data.location,
        duration_label: data.duration_label.trim(),
        duration_days: data.duration_days,
        base_price: data.base_price,
        max_participants: data.max_participants,
        difficulty: data.difficulty,
        includes: data.includes,
        excludes: data.excludes,
        itinerary,
      };

      let listingId = id ?? null;
      let agencyId = useListingsStore.getState().myAgencyId;

      if (!isEditing) {
        const { data: created, error } = await createListing(basePayload);
        if (error || !created) { toast.error(error ?? "Failed to create listing."); return; }
        listingId = created.id;
        agencyId = created.agency_id;
      } else if (listingId) {
        const { error } = await updateListing(listingId, basePayload);
        if (error) { toast.error(error); return; }
      }

      if (!listingId || !agencyId) { toast.error("Something went wrong. Please try again."); return; }

      const finalImages = await uploadStagedImages(listingId, agencyId, data.images);
      const { error: imgError } = await updateListing(listingId, { images: finalImages });
      if (imgError) { toast.error(imgError); return; }

      if (targetStatus) {
        const { error: statusError } = await useListingsStore.getState().setOwnStatus(listingId, targetStatus);
        if (statusError) { toast.error(statusError); return; }
        toast.success(
          targetStatus === "draft" ? "Listing saved as draft." : "Submitted for admin review."
        );
      } else {
        toast.success("Listing updated successfully.");
      }
      navigate("/agency/listings");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Draft: skip validation, use raw values — only meaningful for a listing
  // that hasn't been submitted yet.
  const handleSaveDraft = async () => {
    await doSave(getValues() as ListingFormData, "draft");
  };

  const handlePrimaryAction = handleSubmit((data) => doSave(data, primaryAction.targetStatus));

  if (isFetchingEdit) {
    return (
      <AgencyLayout title="Edit Listing">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Loading listing…</span>
        </div>
      </AgencyLayout>
    );
  }

  const canSaveAsDraft = !isEditing || originalStatus === "draft" || originalStatus === "rejected";

  return (
    <AgencyLayout title={isEditing ? "Edit Listing" : "Create Listing"}>
      <div className="max-w-3xl space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/agency/listings")} className="gap-2 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Listings
        </Button>

        {/* Basic Info */}
        <Card>
          <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Activity Title <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Everest Base Camp Trek - 14 Days"
                disabled={isLoading}
                {...register("title")}
              />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Description <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="Describe your activity in detail…"
                rows={5}
                disabled={isLoading}
                {...register("description")}
              />
              {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category <span className="text-destructive">*</span></Label>
                <Controller
                  name="category"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={isLoading}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                />
                {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Location <span className="text-destructive">*</span></Label>
                <Controller
                  name="location"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={isLoading}>
                      <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                      <SelectContent>{locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                />
                {errors.location && <p className="text-xs text-destructive">{errors.location.message}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing & Details */}
        <Card>
          <CardHeader><CardTitle className="text-base">Pricing & Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Price per Person (NPR) <span className="text-destructive">*</span></Label>
                <Input type="number" placeholder="0" min={0} disabled={isLoading} {...register("base_price")} />
                {errors.base_price && <p className="text-xs text-destructive">{errors.base_price.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Max Participants</Label>
                <Input type="number" placeholder="10" min={1} disabled={isLoading} {...register("max_participants")} />
                {errors.max_participants && <p className="text-xs text-destructive">{errors.max_participants.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duration (display) <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. 14 days" disabled={isLoading} {...register("duration_label")} />
                {errors.duration_label && <p className="text-xs text-destructive">{errors.duration_label.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Duration (days) <span className="text-destructive">*</span></Label>
                <Input type="number" placeholder="14" min={1} step="0.5" disabled={isLoading} {...register("duration_days")} />
                {errors.duration_days && <p className="text-xs text-destructive">{errors.duration_days.message}</p>}
                <p className="text-xs text-muted-foreground">Used for duration search filters — enter a number even if the display text above says "2 weeks".</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Difficulty <span className="text-destructive">*</span></Label>
              <Controller
                name="difficulty"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={isLoading}>
                    <SelectTrigger><SelectValue placeholder="Select difficulty" /></SelectTrigger>
                    <SelectContent>{difficulties.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              />
              {errors.difficulty && <p className="text-xs text-destructive">{errors.difficulty.message}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Images */}
        <Card>
          <CardHeader><CardTitle className="text-base">Photos</CardTitle></CardHeader>
          <CardContent>
            <ImageUploader
              images={images}
              onChange={(imgs) => setValue("images", imgs, { shouldValidate: true })}
              disabled={isLoading}
              maxImages={10}
              maxSizeMB={5}
            />
            {errors.images && <p className="text-xs text-destructive mt-2">{errors.images.message}</p>}
          </CardContent>
        </Card>

        {/* Includes / Excludes */}
        <Card>
          <CardHeader><CardTitle className="text-base">What's Included / Excluded</CardTitle></CardHeader>
          <CardContent className="space-y-5">

            {/* ── Includes ── */}
            <div className="space-y-3">
              <Label>Included</Label>
              {/* Preset chips */}
              <div className="flex flex-wrap gap-1.5">
                {INCLUDE_PRESETS.map((preset) => {
                  const active = includes.includes(preset);
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={isLoading}
                      onClick={() =>
                        setValue(
                          "includes",
                          active ? includes.filter((x) => x !== preset) : [...includes, preset],
                          { shouldValidate: true }
                        )
                      }
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        active
                          ? "bg-primary/15 text-primary border-primary/50"
                          : "bg-muted/40 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {active && <Check className="h-3 w-3" />}
                      {preset}
                    </button>
                  );
                })}
              </div>
              {/* Custom items (not in presets) */}
              {includes.filter((x) => !INCLUDE_PRESETS.includes(x)).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {includes
                    .filter((x) => !INCLUDE_PRESETS.includes(x))
                    .map((item) => (
                      <span key={item} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3 py-1 text-sm">
                        {item}
                        <button type="button" onClick={() => setValue("includes", includes.filter((x) => x !== item))} disabled={isLoading}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                </div>
              )}
              {/* Custom input */}
              <div className="flex gap-2">
                <Input
                  placeholder="Add custom item…"
                  value={newInclude}
                  onChange={(e) => setNewInclude(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addInclude())}
                  disabled={isLoading}
                />
                <Button type="button" variant="outline" size="sm" onClick={addInclude} disabled={isLoading}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Separator />

            {/* ── Excludes ── */}
            <div className="space-y-3">
              <Label>Not Included</Label>
              {/* Preset chips */}
              <div className="flex flex-wrap gap-1.5">
                {EXCLUDE_PRESETS.map((preset) => {
                  const active = excludes.includes(preset);
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={isLoading}
                      onClick={() =>
                        setValue(
                          "excludes",
                          active ? excludes.filter((x) => x !== preset) : [...excludes, preset],
                          { shouldValidate: true }
                        )
                      }
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        active
                          ? "bg-destructive/15 text-destructive border-destructive/50"
                          : "bg-muted/40 text-muted-foreground border-border hover:border-destructive/40 hover:text-foreground"
                      }`}
                    >
                      {active && <X className="h-3 w-3" />}
                      {preset}
                    </button>
                  );
                })}
              </div>
              {/* Custom items (not in presets) */}
              {excludes.filter((x) => !EXCLUDE_PRESETS.includes(x)).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {excludes
                    .filter((x) => !EXCLUDE_PRESETS.includes(x))
                    .map((item) => (
                      <span key={item} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-3 py-1 text-sm">
                        {item}
                        <button type="button" onClick={() => setValue("excludes", excludes.filter((x) => x !== item))} disabled={isLoading}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                </div>
              )}
              {/* Custom input */}
              <div className="flex gap-2">
                <Input
                  placeholder="Add custom item…"
                  value={newExclude}
                  onChange={(e) => setNewExclude(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExclude())}
                  disabled={isLoading}
                />
                <Button type="button" variant="outline" size="sm" onClick={addExclude} disabled={isLoading}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

          </CardContent>
        </Card>

        <ItinerarySection
          itinerary={itinerary}
          isLoading={isLoading}
          onAdd={addDay}
          onUpdate={updateDay}
          onRemove={removeDay}
        />

        {/* Actions */}
        <div className="flex flex-wrap gap-3 justify-end">
          <Button variant="outline" onClick={() => navigate("/agency/listings")} disabled={isLoading}>Cancel</Button>
          <Button variant="outline" className="gap-2" onClick={() => setPreviewOpen(true)} disabled={isLoading}>
            <Eye className="h-4 w-4" /> Preview
          </Button>
          {canSaveAsDraft && (
            <Button variant="outline" onClick={handleSaveDraft} disabled={isLoading}>
              {isLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : "Save as Draft"}
            </Button>
          )}
          <Button onClick={handlePrimaryAction} disabled={isLoading} className="gap-2">
            {isLoading
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</>
              : primaryAction.targetStatus
                ? <><Send className="h-4 w-4" />{primaryAction.label}</>
                : <><Save className="h-4 w-4" />{primaryAction.label}</>
            }
          </Button>
        </div>
      </div>

      <ListingPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        data={getValues()}
        itinerary={itinerary}
        agencyName={user?.name ?? ""}
      />
    </AgencyLayout>
  );
}
