import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function PartnerCTA() {
  return (
    <section className="py-16 md:py-20">
      <div className="container mx-auto px-4">
        <div className="bg-brand-navy text-white rounded-2xl p-8 md:p-14 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-center md:text-left">
            <span className="text-xs font-bold uppercase tracking-widest text-primary">
              Licensed Expedition Operators & Lodges
            </span>
            <h2 className="text-2xl md:text-3xl font-bold mt-2 max-w-lg">
              Host your expeditions on Into Nepal
            </h2>
            <p className="text-white/70 mt-2 max-w-lg">
              Gain direct exposure to thousands of verified, respectful international adventurers. Zero setup fees, rapid direct settlements in NPR or USD, and fair partnership policies.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link to="/agency">
              <Button size="lg" className="rounded-full w-full sm:w-auto">Become a Partner</Button>
            </Link>
            <Link to="/faq">
              <Button size="lg" variant="outline" className="rounded-full w-full sm:w-auto bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white">
                Operator FAQ
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
