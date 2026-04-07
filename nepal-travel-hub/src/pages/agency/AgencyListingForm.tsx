import { useState, useRef } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Plus, X, ImagePlus, Save } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

const categories = ["Trekking", "Adventure", "Cultural", "Wildlife", "Rafting", "Mountaineering"];
const difficulties = ["Easy", "Moderate", "Challenging", "Difficult", "Expert"];
const locations = ["Kathmandu", "Pokhara", "Solukhumbu", "Annapurna Region", "Chitwan", "Langtang", "Mustang", "Sindhupalchok"];

interface ItineraryDay { day: number; title: string; description: string; }

export default function AgencyListingForm() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Basic info
  const [title, setTitle] = useState(isEditing ? "Everest Base Camp Trek - 14 Days Adventure" : "");
  const [description, setDescription] = useState(isEditing ? "Experience the ultimate Himalayan adventure with a guided trek to Everest Base Camp." : "");
  const [category, setCategory] = useState(isEditing ? "Trekking" : "");
  const [location, setLocation] = useState(isEditing ? "Solukhumbu" : "");

  // Pricing & details
  const [price, setPrice] = useState(isEditing ? "1899" : "");
  const [duration, setDuration] = useState(isEditing ? "14 days" : "");
  const [maxParticipants, setMaxParticipants] = useState(isEditing ? "12" : "");
  const [difficulty, setDifficulty] = useState(isEditing ? "Challenging" : "");
  const [featured, setFeatured] = useState(isEditing);

  // Images
  const [images, setImages] = useState<string[]>(
    isEditing ? ["https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=300&h=225&fit=crop"] : []
  );

  // Includes / excludes
  const [includes, setIncludes] = useState<string[]>(["Professional guide", "Accommodation"]);
  const [excludes, setExcludes] = useState<string[]>(["International flights", "Travel insurance"]);
  const [newInclude, setNewInclude] = useState("");
  const [newExclude, setNewExclude] = useState("");

  // Itinerary
  const [itinerary, setItinerary] = useState<ItineraryDay[]>([
    { day: 1, title: "Arrival in Kathmandu", description: "Airport pickup and hotel check-in. Welcome dinner." },
    { day: 2, title: "Kathmandu Sightseeing", description: "Visit Durbar Square, Swayambhunath, and Pashupatinath." },
  ]);

  const [isLoading, setIsLoading] = useState(false);

  const addInclude = () => {
    if (newInclude.trim()) { setIncludes([...includes, newInclude.trim()]); setNewInclude(""); }
  };
  const addExclude = () => {
    if (newExclude.trim()) { setExcludes([...excludes, newExclude.trim()]); setNewExclude(""); }
  };
  const addDay = () => {
    setItinerary([...itinerary, { day: itinerary.length + 1, title: "", description: "" }]);
  };
  const updateDay = (index: number, field: "title" | "description", value: string) => {
    setItinerary((prev) => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
  };
  const removeDay = (index: number) => {
    setItinerary((prev) => prev.filter((_, i) => i !== index).map((d, i) => ({ ...d, day: i + 1 })));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setImages((prev) => [...prev, ev.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
    // reset so same file can be re-selected
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const validate = () => {
    if (!title.trim()) { toast.error("Activity title is required."); return false; }
    if (!description.trim()) { toast.error("Description is required."); return false; }
    if (!category) { toast.error("Please select a category."); return false; }
    if (!location) { toast.error("Please select a location."); return false; }
    if (!price || isNaN(Number(price)) || Number(price) <= 0) { toast.error("Enter a valid price."); return false; }
    if (!duration.trim()) { toast.error("Duration is required."); return false; }
    if (!difficulty) { toast.error("Please select a difficulty."); return false; }
    return true;
  };

  const handleSave = async (status: "published" | "draft") => {
    if (status === "published" && !validate()) return;
    setIsLoading(true);
    // Simulate async save
    await new Promise((r) => setTimeout(r, 600));
    setIsLoading(false);
    toast.success(
      status === "draft"
        ? "Listing saved as draft."
        : isEditing
        ? "Listing updated successfully."
        : "Listing published successfully."
    );
    navigate("/agency/listings");
  };

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
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="Describe your activity in detail…"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category <span className="text-destructive">*</span></Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Location <span className="text-destructive">*</span></Label>
                <Select value={location} onValueChange={setLocation}>
                  <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                  <SelectContent>{locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
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
                <Input type="number" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value)} min={0} />
              </div>
              <div className="space-y-2">
                <Label>Duration <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. 14 days" value={duration} onChange={(e) => setDuration(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Max Participants</Label>
                <Input type="number" placeholder="0" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} min={0} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Difficulty <span className="text-destructive">*</span></Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger><SelectValue placeholder="Select difficulty" /></SelectTrigger>
                  <SelectContent>{difficulties.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch id="featured" checked={featured} onCheckedChange={setFeatured} />
                <Label htmlFor="featured">Request Featured Placement</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Images */}
        <Card>
          <CardHeader><CardTitle className="text-base">Photos</CardTitle></CardHeader>
          <CardContent>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageUpload}
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {images.map((src, i) => (
                <div key={i} className="relative aspect-[4/3] rounded-lg overflow-hidden group">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="aspect-[4/3] rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <ImagePlus className="h-6 w-6" />
                <span className="text-xs">Add Photo</span>
              </button>
            </div>
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
                    <button type="button" onClick={() => setIncludes(includes.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input placeholder="Add item…" value={newInclude} onChange={(e) => setNewInclude(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addInclude())} />
                <Button type="button" variant="outline" size="sm" onClick={addInclude}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Excludes</Label>
              <div className="flex flex-wrap gap-2">
                {excludes.map((item, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-3 py-1 text-sm">
                    {item}
                    <button type="button" onClick={() => setExcludes(excludes.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input placeholder="Add item…" value={newExclude} onChange={(e) => setNewExclude(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExclude())} />
                <Button type="button" variant="outline" size="sm" onClick={addExclude}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Itinerary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Itinerary</CardTitle>
            <Button variant="outline" size="sm" onClick={addDay} className="gap-1"><Plus className="h-4 w-4" /> Add Day</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {itinerary.map((day, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">{day.day}</div>
                  {i < itinerary.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                </div>
                <div className="flex-1 space-y-2 pb-4">
                  <Input
                    placeholder="Day title"
                    value={day.title}
                    onChange={(e) => updateDay(i, "title", e.target.value)}
                  />
                  <Textarea
                    placeholder="Day description…"
                    rows={2}
                    value={day.description}
                    onChange={(e) => updateDay(i, "description", e.target.value)}
                  />
                </div>
                <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => removeDay(i)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {itinerary.length === 0 && (
              <p className="text-sm text-muted-foreground">No itinerary days added yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => navigate("/agency/listings")} disabled={isLoading}>Cancel</Button>
          <Button variant="outline" onClick={() => handleSave("draft")} disabled={isLoading}>
            {isLoading ? "Saving…" : "Save as Draft"}
          </Button>
          <Button onClick={() => handleSave("published")} disabled={isLoading} className="gap-2">
            <Save className="h-4 w-4" />
            {isLoading ? "Saving…" : isEditing ? "Update Listing" : "Publish Listing"}
          </Button>
        </div>
      </div>
    </AgencyLayout>
  );
}
