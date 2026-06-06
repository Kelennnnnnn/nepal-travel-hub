import { useState, useEffect } from "react";
import { FALLBACK_IMAGE_URL } from "@/lib/constants";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, MoreVertical, Edit, Pause, Play, Trash2, Star, MapPin, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useListingsStore } from "@/stores/listingsStore";
import type { Listing, ListingStatus } from "@/stores/listingsStore";

const statusStyle: Record<string, string> = {
  published: "bg-primary/10 text-primary",
  draft: "bg-muted text-muted-foreground",
  paused: "bg-amber-100 text-amber-700",
  pending_review: "bg-blue-100 text-blue-700",
  rejected: "bg-destructive/10 text-destructive",
};

// Map DB status to display-friendly tab filters
const statusToTab = (status: ListingStatus) => {
  if (status === "published") return "active";
  if (status === "paused") return "paused";
  return "draft"; // draft, pending_review, rejected all show in draft tab
};

export default function AgencyListings() {
  const { myListings, isLoading, fetchMyListings, toggleListingStatus, deleteListing } = useListingsStore();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const navigate = useNavigate();

  // Fetch listings on mount
  useEffect(() => {
    fetchMyListings();
  }, [fetchMyListings]);

  const filtered = myListings.filter((l) => {
    const matchSearch = l.title.toLowerCase().includes(search.toLowerCase());
    const matchTab = tab === "all" || statusToTab(l.status) === tab;
    return matchSearch && matchTab;
  });

  const togglePause = async (id: string) => {
    const listing = myListings.find((l) => l.id === id);
    if (!listing) return;
    const nextStatus: ListingStatus = listing.status === "paused" ? "published" : "paused";
    const { error } = await toggleListingStatus(id, nextStatus);
    if (error) {
      toast.error(error);
    } else {
      toast.success(`Listing ${nextStatus === "paused" ? "paused" : "reactivated"} successfully.`);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await deleteListing(id);
    setDeleteId(null);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Listing deleted.");
    }
  };

  const listingToDelete = myListings.find((l) => l.id === deleteId);

  const activeCount = myListings.filter((l) => l.status === "published").length;
  const draftCount = myListings.filter((l) => statusToTab(l.status) === "draft").length;
  const pausedCount = myListings.filter((l) => l.status === "paused").length;

  return (
    <AgencyLayout title="My Listings">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search listings…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button onClick={() => navigate("/agency/listings/new")} className="gap-2">
            <Plus className="h-4 w-4" /> New Listing
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">All ({myListings.length})</TabsTrigger>
            <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
            <TabsTrigger value="draft">Draft ({draftCount})</TabsTrigger>
            <TabsTrigger value="paused">Paused ({pausedCount})</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            {/* Loading skeleton */}
            {isLoading ? (
              <div className="grid gap-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="overflow-hidden animate-pulse">
                    <CardContent className="p-0">
                      <div className="flex flex-col sm:flex-row">
                        <div className="w-full sm:w-44 h-32 bg-muted" />
                        <div className="flex-1 p-4 space-y-3">
                          <div className="flex gap-2">
                            <div className="h-5 w-16 rounded bg-muted" />
                            <div className="h-5 w-20 rounded bg-muted" />
                          </div>
                          <div className="h-5 w-3/4 rounded bg-muted" />
                          <div className="flex gap-3">
                            <div className="h-4 w-24 rounded bg-muted" />
                            <div className="h-4 w-12 rounded bg-muted" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid gap-4">
                {filtered.map((listing) => (
                  <Card key={listing.id} className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="flex flex-col sm:flex-row">
                        <img src={listing.images?.[0] || FALLBACK_IMAGE_URL} alt={listing.title} className="w-full sm:w-44 h-32 object-cover" />
                        <div className="flex-1 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="secondary" className={statusStyle[listing.status] || statusStyle.draft}>{listing.status}</Badge>
                              <Badge variant="outline" className="text-xs">{listing.category}</Badge>
                            </div>
                            <h3 className="font-semibold text-foreground truncate">{listing.title}</h3>
                            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {listing.location}</span>
                              <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {listing.rating}</span>
                              <span>{listing.review_count} reviews</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="text-lg font-bold text-foreground">${listing.price}<span className="text-sm font-normal text-muted-foreground">/person</span></p>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => navigate(`/agency/listings/${listing.id}/edit`)}>
                                  <Edit className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => togglePause(listing.id)}>
                                  {listing.status === "paused"
                                    ? <><Play className="mr-2 h-4 w-4" /> Reactivate</>
                                    : <><Pause className="mr-2 h-4 w-4" /> Pause</>}
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(listing.id)}>
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {filtered.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">No listings found.</div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete listing?</AlertDialogTitle>
            <AlertDialogDescription>
              "{listingToDelete?.title}" will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && handleDelete(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AgencyLayout>
  );
}
