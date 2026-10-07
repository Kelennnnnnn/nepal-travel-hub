import { CheckCircle2 } from "lucide-react";
import { useSiteContent } from "@/hooks/useSiteContent";

interface Commitment {
  key: string;
  title: string;
  description: string;
}

const DEFAULT_COMMITMENTS: Commitment[] = [
  { key: "porter_welfare", title: "Porter & Guide Welfare Standard", description: "We ask every partner agency to commit to fair wages, reasonable load limits for porters, and insurance coverage for their support staff." },
  { key: "low_plastic", title: "Low-Plastic Routes", description: "We ask partner agencies to minimise single-use plastic on their trips — refillable water stations and no-trace waste practices where possible." },
  { key: "local_lodging", title: "Local, Family-Run Lodging", description: "We ask partner agencies to prioritise independent, family-run teahouses and lodges over large chains when they have a choice." },
];

const COVER_IMAGE = "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=1000&h=1200&fit=crop";

export function CommunityImpact() {
  const content = useSiteContent("community_impact", {
    heading: "Adventure Tourism That Truly Honors the Mountain Communities",
    body: "Traditional international trekking booking channels often strip up to 50% of your booking fee in overseas agency margins. Into Nepal directly links conscientious global adventurers with licensed, locally-owned trekking agencies.",
    commitments: DEFAULT_COMMITMENTS,
  } as { heading: string; body: string; commitments: Commitment[] });

  return (
    <section className="py-16 md:py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div className="relative rounded-2xl overflow-hidden min-h-[360px] lg:min-h-[480px]">
            <img
              src={COVER_IMAGE}
              alt="Local Sherpa community member in a Himalayan village"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-primary">
              Responsible Mountaineering
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mt-2 mb-4">
              {content.heading}
            </h2>
            <p className="text-muted-foreground mb-6 max-w-xl">
              {content.body}
            </p>

            <div className="space-y-4">
              {(content.commitments ?? DEFAULT_COMMITMENTS).map((item) => (
                <div key={item.key} className="flex gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Agencies that opt into a standard show a matching badge on their profile — look for it before you book.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
