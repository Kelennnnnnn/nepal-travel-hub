import { Link } from "react-router-dom";
import { Facebook, Instagram, Twitter } from "lucide-react";

const footerLinks = {
  explore: [
    { name: "Everest Region", href: "/activities?location=Solukhumbu" },
    { name: "Annapurna Circuit", href: "/activities?location=Annapurna%20Region" },
    { name: "Upper Mustang", href: "/activities?location=Mustang" },
    { name: "Langtang & Helambu", href: "/activities?location=Langtang" },
    { name: "Wild Far-West Treks", href: "/activities" },
  ],
  about: [
    { name: "Our Responsible Charter", href: "/about" },
    { name: "Sherpa & Porter Welfare", href: "/about" },
    { name: "Difficulty Rating System", href: "/activities" },
    { name: "List your Expeditions", href: "/agency" },
    { name: "Contact Team Support", href: "/contact" },
  ],
  legal: [
    { name: "Terms of Service", href: "/terms" },
    { name: "Privacy Policy", href: "/privacy" },
    { name: "High Altitude Insurance", href: "/faq" },
    { name: "Cancellation & Refunds", href: "/cancellation" },
  ],
};

export function Footer() {
  return (
    <footer className="bg-brand-navy text-white/80">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12">
          {/* Brand Section */}
          <div className="lg:col-span-2">
            <Link to="/" className="inline-flex flex-col mb-4">
              <span className="font-serif italic text-2xl font-bold text-white">Into Nepal</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50 mt-0.5">
                Himalayan Expeditions
              </span>
            </Link>
            <p className="text-white/60 max-w-sm">
              The curated expedition marketplace for genuine Himalayan journeys. Powered by certified local guides, respectful environmental stewardship, and unequaled adventure booking.
            </p>
            <div className="flex items-center gap-3 mt-6">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="p-2 rounded-full bg-white/10 border border-white/10 hover:border-primary hover:text-primary transition-colors"
              >
                <Facebook className="h-4 w-4" />
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="p-2 rounded-full bg-white/10 border border-white/10 hover:border-primary hover:text-primary transition-colors"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Twitter"
                className="p-2 rounded-full bg-white/10 border border-white/10 hover:border-primary hover:text-primary transition-colors"
              >
                <Twitter className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4 text-sm uppercase tracking-wide">Explore</h4>
            <ul className="space-y-3">
              {footerLinks.explore.map((link) => (
                <li key={link.name}>
                  <Link to={link.href} className="text-sm text-white/60 hover:text-primary transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4 text-sm uppercase tracking-wide">About Into Nepal</h4>
            <ul className="space-y-3">
              {footerLinks.about.map((link) => (
                <li key={link.name}>
                  <Link to={link.href} className="text-sm text-white/60 hover:text-primary transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4 text-sm uppercase tracking-wide">Legal & Trust</h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <Link to={link.href} className="text-sm text-white/60 hover:text-primary transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-3">
          <p className="text-sm text-white/50 text-center md:text-left">
            © {new Date().getFullYear()} Into Nepal. All rights reserved. Built for the modern explorer.
          </p>
          <div className="flex items-center gap-4 text-xs text-white/50">
            <span>Kathmandu, Nepal</span>
            <Link to="/admin/login" className="hover:text-primary transition-colors">
              Admin Login
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
