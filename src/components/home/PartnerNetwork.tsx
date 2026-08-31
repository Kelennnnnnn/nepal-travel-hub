import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Listing } from "@/stores/listingsStore";

const SPECIALTIES = ["Trekking Specialists", "Cultural Tour Guides", "Wildlife & Eco Tours", "Mountaineering Experts"];

interface PartnerNetworkProps {
  listings: Listing[];
}

export function PartnerNetwork({ listings }: PartnerNetworkProps) {
  const agencyCount = new Set(listings.map((l) => l.agency_id)).size;

  return (
    <section className="py-16 md:py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-3 gap-8 items-center">
          <div className="lg:col-span-2">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">Our Global Network of Verified Partners</h2>
            <p className="text-muted-foreground mb-6 max-w-2xl">
              We work exclusively with certified, locally-owned agencies committed to sustainable tourism and fair wages.
            </p>
            <div className="flex flex-wrap gap-3">
              {SPECIALTIES.map((label) => (
                <span
                  key={label}
                  className="px-4 py-2 rounded-full bg-card border border-border text-sm font-medium"
                >
                  {label}
                </span>
              ))}
              {agencyCount > 0 && (
                <span className="px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-semibold">
                  +{agencyCount} verified local {agencyCount === 1 ? "agency" : "agencies"}
                </span>
              )}
            </div>
          </div>

          <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
            <p className="font-semibold mb-1">Are you a tour operator?</p>
            <p className="text-sm text-muted-foreground mb-4">
              Join our network and reach a global audience of dedicated explorers.
            </p>
            <Link to="/agency">
              <Button className="w-full group">
                List your property
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
