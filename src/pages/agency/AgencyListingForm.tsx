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
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Plus, X, Save, Loader2 } from "lucide-react";
import { ImageUploader } from "@/components/uploads/ImageUploader";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useListingsStore } from "@/stores/listingsStore";
import type { ListingCategory, ListingDifficulty, ListingStatus } from "@/stores/listingsStore";
import { listingFormSchema, type ListingFormData } from "@/lib/validations";

const categories = ["Trekking", "Adventure", "Cultural", "Wildlife", "Rafting", "Mountaineering", "Wellness", "Photography"];
const difficulties = ["Easy", "Moderate", "Challenging", "Difficult", "Expert"];
const locations = ["Kathmandu", "Pokhara", "Solukhumbu", "Annapurna Region", "Chitwan", "Langtang", "Mustang", "Sindhupalchok"];

interface ItineraryDay { day: number; title: string; description: string; }

export default function AgencyListingForm() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const { createListing, updateListing, fetchMyListings, myListings } = useListingsStore();

  const [featured, setFeatured] = useState(false);
  const [itinerary, setItinerary] = useState<ItineraryDay[]>([]);
  const [newInclude, setNewInclude] = useState("");
  const [newExclude, setNewExclude] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingEdit, setIsFetchingEdit] = useState(false);

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
      duration: "",
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
          category: listing.category as ListingFormData["category"],
          location: listing.location,
          price: Number(listing.price),
          duration: listing.duration,
          max_participants: listing.max_participants,
          difficulty: listing.difficulty as ListingFormData["difficulty"],
          images: listing.images ?? [],
          includes: listing.includes ?? [],
          excludes: listing.excludes ?? [],
        });
        setFeatured(listing.featured);
        setItinerary(
          (listing.itinerary ?? []).map((item, i) => ({
            day: (item as Record<string, unknown>).day as number ?? i + 1,
            title: (item as Record<string, unknown>).title as string ?? "",
            description: (item as Record<string, unknown>).description as string ?? "",
          }))
        );
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

  const addDay = () => setItinerary([...itinerary, { day: itinerary.length + 1, title: "", description: "" }]);
  const updateDay = (i: number, field: "title" | "description", val: string) =>
    setItinerary((prev) => prev.map((d, j) => j === i ? { ...d, [field]: val } : d));
  const removeDay = (i: number) =>
    setItinerary((prev) => prev.filter((_, j) => j !== i).map((d, j) => ({ ...d, day: j + 1 })));

  const uploadImages = async (imageList: string[]): Promise<string[]> => {
    const result: string[] = [];
    for (const img of imageList) {
      if (!img.startsWith("data:")) { result.push(img); continue; }
      try {
        const res = await fetch(img);
        const blob = await res.blob();
        const ext = blob.type.split("/")[1] || "png";
        const filePath = `listings/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("listing-images").upload(filePath, blob, { contentType: blob.type });
        if (error) { result.push(img); continue; }
        const { data } = supabase.storage.from("listing-images").getPublicUrl(filePath);
        result.push(data.publicUrl);
      } catch {
        result.push(img);
      }
    }
    return result;
  };

  const doSave = async (data: ListingFormData, status: "published" | "draft") => {
    setIsLoading(true);
    try {
      const uploadedImages = await uploadImages(data.images);
      const payload = {
        title: data.title.trim(),
        description: data.description.trim(),
        category: data.category as ListingCategory,
        location: data.location,
        price: data.price,
        duration: data.duration.trim(),
        max_participants: data.max_participants,
        difficulty: data.difficulty as ListingDifficulty,
        images: uploadedImages,
        includes: data.includes,
        excludes: data.excludes,
        itinerary: itinerary as Record<string, unknown>[],
        featured,
        status: status as ListingStatus,
      };

      if (isEditing && id) {
        const { error } = await updateListing(id, payload);
        if (error) { toast.error(error); return; }
        toast.success("Listing updated successfully.");
      } else {
        const { error } = await createListing(payload);
        if (error) { toast.error(error); return; }
        toast.success(status === "draft" ? "Listing saved as draft." : "Listing published successfully.");
      }
      navigate("/agency/listings");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Draft: skip validation, use raw values
  const handleSaveDraft = async () => {
    await doSave(getValues() as ListingFormData, "draft");
  };

  // Publish: run full zod validation first
  const handlePublish = handleSubmit((data) => doSave(data, "published"));

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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Price per Person ($) <span className="text-destructive">*</span></Label>
                <Input type="number" placeholder="0" min={0} disabled={isLoading} {...register("price")} />
                {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Duration <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. 14 days" disabled={isLoading} {...register("duration")} />
                {errors.duration && <p className="text-xs text-destructive">{errors.duration.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Max Participants</Label>
                <Input type="number" placeholder="10" min={1} disabled={isLoading} {...register("max_participants")} />
                {errors.max_participants && <p className="text-xs text-destructive">{errors.max_participants.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="flex items-center gap-3 pt-6">
                <Switch id="featured" checked={featured} onCheckedChange={setFeatured} disabled={isLoading} />
                <Label htmlFor="featured">Request Featured Placement</Label>
              </div>
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
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Includes</Label>
              <div className="flex flex-wrap gap-2">
                {includes.map((item, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3 py-1 text-sm">
                    {item}
                    <button type="button" onClick={() => setValue("includes", includes.filter((_, j) => j !== i))} disabled={isLoading}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input placeholder="Add item…" value={newInclude} onChange={(e) => setNewInclude(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addInclude())} disabled={isLoading} />
                <Button type="button" variant="outline" size="sm" onClick={addInclude} disabled={isLoading}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Excludes</Label>
              <div className="flex flex-wrap gap-2">
                {excludes.map((item, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-3 py-1 text-sm">
                    {item}
                    <button type="button" onClick={() => setValue("excludes", excludes.filter((_, j) => j !== i))} disabled={isLoading}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input placeholder="Add item…" value={newExclude} onChange={(e) => setNewExclude(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExclude())} disabled={isLoading} />
                <Button type="button" variant="outline" size="sm" onClick={addExclude} disabled={isLoading}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Itinerary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Itinerary</CardTitle>
            <Button variant="outline" size="sm" onClick={addDay} className="gap-1" disabled={isLoading}><Plus className="h-4 w-4" /> Add Day</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {itinerary.map((day, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">{day.day}</div>
                  {i < itinerary.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                </div>
                <div className="flex-1 space-y-2 pb-4">
                  <Input placeholder="Day title" value={day.title} onChange={(e) => updateDay(i, "title", e.target.value)} disabled={isLoading} />
                  <Textarea placeholder="Day description…" rows={2} value={day.description} onChange={(e) => updateDay(i, "description", e.target.value)} disabled={isLoading} />
                </div>
                <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => removeDay(i)} disabled={isLoading}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {itinerary.length === 0 && <p className="text-sm text-muted-foreground">No itinerary days added yet.</p>}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => navigate("/agency/listings")} disabled={isLoading}>Cancel</Button>
          <Button variant="outline" onClick={handleSaveDraft} disabled={isLoading}>
            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : "Save as Draft"}
          </Button>
          <Button onClick={handlePublish} disabled={isLoading} className="gap-2">
            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : <><Save className="h-4 w-4" />{isEditing ? "Update Listing" : "Publish Listing"}</>}
          </Button>
        </div>
      </div>
    </AgencyLayout>
  );
}
