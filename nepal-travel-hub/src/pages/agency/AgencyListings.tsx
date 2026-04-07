import { useState } from "react";
import { AgencyLayout } from "@/components/agency/AgencyLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, MoreVertical, Eye, Edit, Pause, Play, Trash2, Star, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface Listing {
  id: string;
  title: string;
  image: string;
  location: string;
  price: number;
  rating: number;
  bookings: number;
  status: "active" | "draft" | "paused";
  category: string;
}

const initialListings: Listing[] = [
  { id: "1", title: "Everest Base Camp Trek - 14 Days Adventure", image: "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=300&fit=crop", location: "Solukhumbu", price: 1899, rating: 4.9, bookings: 34, status: "active", category: "Trekking" },
  { id: "2", title: "Chitwan National Park Safari Experience", image: "https://images.unsplash.com/photo-1585016495481-91613a3ab5fe?w=400&h=300&fit=crop", location: "Chitwan", price: 450, rating: 4.7, bookings: 19, status: "active", category: "Wildlife" },
  { id: "3", title: "Annapurna Circuit Trek", image: "https://images.unsplash.com/photo-1571401835393-8c5f35328320?w=400&h=300&fit=crop", location: "Annapurna Region", price: 1599, rating: 4.8, bookings: 26, status: "draft", category: "Trekking" },
  { id: "4", title: "Langtang Valley Trek", image: "https://images.unsplash.com/photo-1486911278844-a81c5267e227?w=400&h=300&fit=crop", location: "Langtang", price: 1099, rating: 4.8, bookings: 17, status: "paused", category: "Trekking" },
];

const statusStyle: Record<string, string> = {
  active: "bg-primary/10 text-primary",
  draft: "bg-muted text-muted-foreground",
  paused: "bg-amber-100 text-amber-700",
};

export default function AgencyListings() {
  const [listings, setListings] = useState<Listing[]>(initialListings);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const navigate = useNavigate();

  const filtered = listings.filter((l) => {
    const matchSearch = l.title.toLowerCase().includes(search.toLowerCase());
    const matchTab = tab === "all" || l.status === tab;
    return matchSearch && matchTab;
  });

  const togglePause = (id: string) => {
    setListings((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = l.status === "paused" ? "active" : "paused";
        toast.success(`Listing ${next === "paused" ? "paused" : "reactivated"} successfully.`);
        return { ...l, status: next };
      })
    );
  };

  const handleDelete = (id: string) => {
    setListings((prev) => prev.filter((l) => l.id !== id));
    setDeleteId(null);
    toast.success("Listing deleted.");
  };

  const listingToDelete = listings.find((l) => l.id === deleteId);

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
            <TabsTrigger value="all">All ({listings.length})</TabsTrigger>
            <TabsTrigger value="active">Active ({listings.filter((l) => l.status === "active").length})</TabsTrigger>
            <TabsTrigger value="draft">Draft ({listings.filter((l) => l.status === "draft").length})</TabsTrigger>
            <TabsTrigger value="paused">Paused ({listings.filter((l) => l.status === "paused").length})</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            <div className="grid gap-4">
              {filtered.map((listing) => (
                <Card key={listing.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex flex-col sm:flex-row">
                      <img src={listing.image} alt={listing.title} className="w-full sm:w-44 h-32 object-cover" />
                      <div className="flex-1 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className={statusStyle[listing.status]}>{listing.status}</Badge>
                            <Badge variant="outline" className="text-xs">{listing.category}</Badge>
                          </div>
                          <h3 className="font-semibold text-foreground truncate">{listing.title}</h3>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {listing.location}</span>
                            <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {listing.rating}</span>
                            <span>{listing.bookings} bookings</span>
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
                                <Eye className="mr-2 h-4 w-4" /> View / Edit
                              </DropdownMenuItem>
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
