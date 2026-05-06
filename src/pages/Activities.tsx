import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, MapPin, SlidersHorizontal, X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Layout } from "@/components/layout/Layout";
import { ActivityCard } from "@/components/activities/ActivityCard";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { usePublishedListings } from "@/lib/queries";
import { SEO } from "@/components/SEO";
import { categories, locations } from "@/data/activities";
import type { Listing } from "@/stores/listingsStore";
import type { Activity } from "@/components/activities/ActivityCard";

const PAGE_SIZE = 20;
const DIFFICULTIES = ["Easy", "Moderate", "Challenging", "Difficult", "Expert"];
const DURATION_RANGES = [
  { value: "1", label: "1 day" },
  { value: "2-3", label: "2-3 days" },
  { value: "4-7", label: "4-7 days" },
  { value: "8+", label: "8+ days" },
];

function listingToActivity(listing: Listing): Activity {
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    image: listing.images?.[0] || "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&h=600&fit=crop",
    location: listing.location,
    duration: listing.duration,
    price: Number(listing.price),
    rating: Number(listing.rating),
    reviewCount: listing.review_count,
    category: listing.category,
    agency: listing.agency_id,
    maxParticipants: listing.max_participants,
    featured: listing.featured,
  };
}

export default function Activities() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive filter state from URL
  const search = searchParams.get("search") || "";
  const category = searchParams.get("category") || "all";
  const location = searchParams.get("location") || "All Locations";
  const sortBy = searchParams.get("sort") || "popular";
  const page = Number(searchParams.get("page") || "1");
  const priceMin = searchParams.get("priceMin") ? Number(searchParams.get("priceMin")) : undefined;
  const priceMax = searchParams.get("priceMax") ? Number(searchParams.get("priceMax")) : undefined;
  const difficulties = searchParams.get("difficulty")
    ? searchParams.get("difficulty")!.split(",")
    : [];
  const durationRange = searchParams.get("duration") || "all";
  const availableOnDate = searchParams.get("date") || undefined;

  // Local input state for debounced/uncontrolled fields
  const [searchInput, setSearchInput] = useState(search);
  const [priceMinInput, setPriceMinInput] = useState(searchParams.get("priceMin") || "");
  const [priceMaxInput, setPriceMaxInput] = useState(searchParams.get("priceMax") || "");

  // Sync searchInput → URL with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      updateParam("search", searchInput || null);
      updateParam("page", null);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const updateParam = useCallback((key: string, value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null || value === "") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setPage = (p: number) => updateParam("page", String(p));

  const toggleDifficulty = (d: string) => {
    const next = difficulties.includes(d)
      ? difficulties.filter((x) => x !== d)
      : [...difficulties, d];
    updateParam("difficulty", next.length ? next.join(",") : null);
    updateParam("page", null);
  };

  const applyPriceFilter = () => {
    updateParam("priceMin", priceMinInput || null);
    updateParam("priceMax", priceMaxInput || null);
    updateParam("page", null);
  };

  const clearAll = () => {
    setSearchInput("");
    setPriceMinInput("");
    setPriceMaxInput("");
    setSearchParams({}, { replace: true });
  };

  // Server-side query
  const { data, isLoading, isFetching } = usePublishedListings({
    search: search || undefined,
    category: category !== "all" ? category : undefined,
    location: location !== "All Locations" ? location : undefined,
    sortBy: sortBy === "popular" ? undefined : sortBy === "rating" ? "rating" : sortBy === "price-low" ? "price_asc" : "price_desc",
    page,
    pageSize: PAGE_SIZE,
    priceMin,
    priceMax,
    difficulties: difficulties.length ? difficulties : undefined,
    durationRange: durationRange !== "all" ? durationRange : undefined,
    availableOnDate,
  });

  const activities = (data?.listings ?? []).map((l) => listingToActivity(l as Listing));
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Active filter count for badge
  const activeFilterCount = [
    category !== "all",
    location !== "All Locations",
    priceMin != null,
    priceMax != null,
    difficulties.length > 0,
    durationRange !== "all",
    !!availableOnDate,
  ].filter(Boolean).length;

  // Filter panel (shared between desktop sidebar and mobile sheet)
  const FilterPanel = () => (
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
          <Button size="sm" variant="outline" onClick={applyPriceFilter}>Apply</Button>
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
                onCheckedChange={() => toggleDifficulty(d)}
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
          onValueChange={(value) => {
            updateParam("duration", value === "all" ? null : value);
            updateParam("page", null);
          }}
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
          onChange={(e) => {
            updateParam("date", e.target.value || null);
            updateParam("page", null);
          }}
        />
        {availableOnDate && (
          <button onClick={() => updateParam("date", null)} className="text-xs text-primary hover:underline mt-1">
            Clear date
          </button>
        )}
      </div>

      <Separator />

      <Button variant="outline" className="w-full" onClick={clearAll}>Clear All Filters</Button>
    </div>
  );

  return (
    <Layout>
      <SEO
        title="Explore Nepal Activities"
        description="Browse 100+ authentic Nepal travel experiences — trekking, cultural tours, wildlife, rafting and more. Filter by category, price and availability."
      />
      {/* Header */}
      <section className="pt-24 md:pt-32 pb-8 bg-muted/30">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Explore Nepal Activities</h1>
          <p className="text-muted-foreground">
            {total > 0
              ? `${total} authentic experience${total !== 1 ? "s" : ""} from verified local agencies`
              : "Discover authentic experiences from verified local agencies"}
          </p>
        </div>
      </section>

      {/* Search & Sort Bar */}
      <section className="sticky top-16 md:top-20 z-40 bg-card border-b border-border py-4">
        <div className="container mx-auto px-4">
          <div className="flex gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search activities, locations..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10 h-12"
              />
            </div>

            {/* Category */}
            <Select value={category} onValueChange={(v) => { updateParam("category", v === "all" ? null : v); updateParam("page", null); }}>
              <SelectTrigger className="w-40 h-12 hidden md:flex">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.icon} {cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Location */}
            <Select value={location} onValueChange={(v) => { updateParam("location", v === "All Locations" ? null : v); updateParam("page", null); }}>
              <SelectTrigger className="w-44 h-12 hidden md:flex">
                <MapPin className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sortBy} onValueChange={(v) => { updateParam("sort", v === "popular" ? null : v); updateParam("page", null); }}>
              <SelectTrigger className="w-44 h-12 hidden md:flex">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="popular">Most Popular</SelectItem>
                <SelectItem value="rating">Highest Rated</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>

            {/* Mobile: Filters Sheet */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="h-12 gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="hidden sm:inline">Filters</span>
                  {activeFilterCount > 0 && (
                    <Badge className="bg-primary text-primary-foreground text-xs px-1.5">{activeFilterCount}</Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="overflow-y-auto">
                <SheetHeader className="mb-6">
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                {/* Mobile-only: category, location, sort */}
                <div className="space-y-4 mb-6 md:hidden">
                  <Select value={category} onValueChange={(v) => { updateParam("category", v === "all" ? null : v); updateParam("page", null); }}>
                    <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.icon} {cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={location} onValueChange={(v) => { updateParam("location", v === "All Locations" ? null : v); updateParam("page", null); }}>
                    <SelectTrigger><SelectValue placeholder="Location" /></SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => (
                        <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sortBy} onValueChange={(v) => { updateParam("sort", v === "popular" ? null : v); updateParam("page", null); }}>
                    <SelectTrigger><SelectValue placeholder="Sort by" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="popular">Most Popular</SelectItem>
                      <SelectItem value="rating">Highest Rated</SelectItem>
                      <SelectItem value="price-low">Price: Low to High</SelectItem>
                      <SelectItem value="price-high">Price: High to Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <Separator />
                </div>
                <FilterPanel />
              </SheetContent>
            </Sheet>
          </div>

          {/* Active filter badges */}
          {(search || category !== "all" || location !== "All Locations" || priceMin != null || priceMax != null || difficulties.length > 0 || durationRange !== "all" || availableOnDate) && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-xs text-muted-foreground">Active filters:</span>
              {search && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  "{search}"
                  <button onClick={() => { setSearchInput(""); updateParam("search", null); }}><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {category !== "all" && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  {categories.find((c) => c.id === category)?.name}
                  <button onClick={() => updateParam("category", null)}><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {location !== "All Locations" && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  {location}
                  <button onClick={() => updateParam("location", null)}><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {(priceMin != null || priceMax != null) && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  ${priceMin ?? 0}–{priceMax != null ? `$${priceMax}` : "any"}
                  <button onClick={() => { setPriceMinInput(""); setPriceMaxInput(""); updateParam("priceMin", null); updateParam("priceMax", null); }}><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {difficulties.map((d) => (
                <Badge key={d} variant="secondary" className="gap-1 text-xs">
                  {d}
                  <button onClick={() => toggleDifficulty(d)}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
              {durationRange !== "all" && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  {DURATION_RANGES.find((range) => range.value === durationRange)?.label}
                  <button onClick={() => updateParam("duration", null)}><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {availableOnDate && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  {new Date(availableOnDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  <button onClick={() => updateParam("date", null)}><X className="h-3 w-3" /></button>
                </Badge>
              )}
              <button onClick={clearAll} className="text-xs text-primary hover:underline">Clear all</button>
            </div>
          )}
        </div>
      </section>

      {/* Results */}
      <section className="py-8 md:py-12">
        <div className="container mx-auto px-4">
          {/* Results count */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Loading…" : (
                <>
                  Showing <span className="font-medium text-foreground">{total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}</span> of{" "}
                  <span className="font-medium text-foreground">{total}</span> activities
                </>
              )}
              {isFetching && !isLoading && <Loader2 className="inline-block h-3 w-3 animate-spin ml-2" />}
            </p>
          </div>

          {/* Skeletons */}
          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border overflow-hidden">
                  <Skeleton className="aspect-[4/3] w-full" />
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    <div className="flex gap-3 pt-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : activities.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {activities.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🏔️</div>
              <h3 className="text-xl font-semibold mb-2">No activities found</h3>
              <p className="text-muted-foreground mb-6">Try adjusting your filters or search terms</p>
              <Button variant="outline" onClick={clearAll}>Clear all filters</Button>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>

              <div className="flex gap-1">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <Button
                      key={p}
                      variant={p === page ? "default" : "outline"}
                      size="sm"
                      className="w-9"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  );
                })}
                {totalPages > 7 && <span className="px-2 py-1 text-muted-foreground">…{totalPages}</span>}
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
