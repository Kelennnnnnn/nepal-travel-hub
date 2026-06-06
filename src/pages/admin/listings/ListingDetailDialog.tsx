import {
  MapPin, Calendar, Mail, Phone, ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { Listing, ListingStatus } from "@/stores/listingsStore";
import type { AgencyApplication } from "@/stores/agencyStore";

const money = new Intl.NumberFormat(undefined, {
  style: "currency", currency: "USD",
  minimumFractionDigits: 0,
});

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: Listing | null;
  allApplications: AgencyApplication[];
  isLoadingAll: boolean;
  statusBadge: (status: ListingStatus) => React.ReactNode;
  onApprove: (listing: Listing) => void;
  onReject: () => void;
}

function agencyApplication(agencyId: string, apps: AgencyApplication[]) {
  return apps.find((a) => a.user_id === agencyId);
}

export function ListingDetailDialog({
  open, onOpenChange, listing, allApplications, isLoadingAll, statusBadge, onApprove, onReject,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Listing details</DialogTitle>
          <DialogDescription>Full activity information and agency context</DialogDescription>
        </DialogHeader>
        {listing && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <h3 className="text-xl font-semibold">{listing.title}</h3>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {statusBadge(listing.status)}
                  <span className="text-sm text-muted-foreground">
                    {listing.category} · {listing.difficulty}
                  </span>
                </div>
              </div>
              <p className="text-lg font-bold text-primary">
                {money.format(Number(listing.price))}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                {listing.location}
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Submitted {formatDate(listing.created_at)}
              </div>
              <div><span className="text-muted-foreground">Duration:</span> {listing.duration}</div>
              <div><span className="text-muted-foreground">Max guests:</span> {listing.max_participants}</div>
              <div><span className="text-muted-foreground">Featured:</span> {listing.featured ? "Yes" : "No"}</div>
              <div>
                <span className="text-muted-foreground">Rating:</span>{" "}
                {listing.rating} ({listing.review_count} reviews)
              </div>
            </div>

            {(() => {
              const agency = agencyApplication(listing.agency_id, allApplications);
              return agency ? (
                <div className="p-4 bg-muted/50 rounded-xl space-y-2">
                  <h4 className="font-semibold text-sm">Agency</h4>
                  <p className="font-medium">{agency.company_name}</p>
                  <div className="grid sm:grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {agency.email}
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {agency.phone}
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {agency.city}, {agency.district}
                    </div>
                  </div>
                </div>
              ) : isLoadingAll ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                <div className="p-4 bg-muted/50 rounded-xl text-sm text-muted-foreground">
                  No agency application on file for this owner.
                </div>
              );
            })()}

            <div>
              <h4 className="font-semibold text-sm mb-2">Description</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{listing.description}</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 bg-muted/50 rounded-xl">
                <h4 className="font-semibold text-sm mb-2">Includes</h4>
                <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
                  {(listing.includes ?? []).map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
              <div className="p-4 bg-muted/50 rounded-xl">
                <h4 className="font-semibold text-sm mb-2">Excludes</h4>
                <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
                  {(listing.excludes ?? []).map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            </div>

            <div className="p-4 bg-muted/50 rounded-xl">
              <h4 className="font-semibold text-sm mb-2">Itinerary</h4>
              <pre className="text-xs text-muted-foreground overflow-x-auto max-h-48 overflow-y-auto rounded-md bg-background p-3 border">
                {JSON.stringify(listing.itinerary ?? [], null, 2)}
              </pre>
            </div>

            {(listing.images?.length ?? 0) > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-2">Images</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {listing.images.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer"
                      className="aspect-video rounded-lg overflow-hidden border bg-muted">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {listing && (listing.status === "pending_review" || listing.status === "draft") && (
            <>
              <Button variant="destructive" onClick={() => { onOpenChange(false); onReject(); }}>Reject</Button>
              <Button onClick={() => { onApprove(listing); onOpenChange(false); }}>
                Approve & publish
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
