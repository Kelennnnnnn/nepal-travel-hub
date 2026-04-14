import { Mountain, Shield, Users, Globe } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { SEO } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";

const VALUES = [
  {
    icon: Shield,
    title: "Trust & Verification",
    desc: "Every agency is manually verified with government-issued documents before listing on our platform.",
  },
  {
    icon: Globe,
    title: "Local Expertise",
    desc: "We partner exclusively with Nepal-based agencies who know the mountains, culture, and routes firsthand.",
  },
  {
    icon: Users,
    title: "Community First",
    desc: "Our model keeps more money in the hands of local guides and agencies, supporting Nepali tourism communities.",
  },
  {
    icon: Mountain,
    title: "Authentic Experiences",
    desc: "We curate real adventures — from Everest Base Camp to cultural heritage tours — not cookie-cutter packages.",
  },
];

const TEAM = [
  { name: "Kelen Dahal", role: "Founder & CEO", initials: "KD" },
  { name: "Team Member", role: "Head of Operations", initials: "TM" },
  { name: "Team Member", role: "Lead Engineer", initials: "TM" },
];

export default function About() {
  return (
    <Layout>
      <SEO title="About Us" description="Learn about Yatra Nepal — our mission to connect travelers with authentic Nepal experiences through verified local agencies." />
      <div className="pt-24 pb-16 min-h-screen">
        {/* Hero */}
        <div className="bg-muted/30 py-16 mb-16">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <div className="flex items-center justify-center gap-2 mb-6">
              <Mountain className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold">
                Yatra<span className="text-primary">Nepal</span>
              </span>
            </div>
            <h1 className="text-4xl font-bold mb-4">
              Connecting Travelers with Nepal's Best Local Agencies
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
              Yatra Nepal was built to make authentic Himalayan adventures accessible — and to
              ensure that the agencies and guides who make them possible are fairly represented
              and fairly paid.
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 max-w-4xl space-y-20">
          {/* Story */}
          <section className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-2xl font-bold mb-4">Our Story</h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  Nepal attracts hundreds of thousands of trekkers and adventure travelers every year.
                  Yet booking a quality, verified local agency was surprisingly difficult — scattered
                  across travel forums, WhatsApp groups, and word-of-mouth recommendations.
                </p>
                <p>
                  We built Yatra Nepal to fix that. A single, trusted platform where travelers can
                  discover, compare, and book verified local agencies — and where agencies can manage
                  their listings, bookings, and earnings without the friction of outdated tools.
                </p>
                <p>
                  Nepal's tourism industry supports millions of families. We believe technology
                  should empower those communities, not extract from them.
                </p>
              </div>
            </div>
            <div className="bg-muted/50 rounded-2xl aspect-square flex items-center justify-center">
              <Mountain className="h-24 w-24 text-muted-foreground/40" />
            </div>
          </section>

          {/* Values */}
          <section>
            <h2 className="text-2xl font-bold mb-8 text-center">What We Stand For</h2>
            <div className="grid sm:grid-cols-2 gap-6">
              {VALUES.map((v) => (
                <Card key={v.title}>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <v.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold mb-1">{v.title}</p>
                        <p className="text-muted-foreground text-sm leading-relaxed">{v.desc}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Team */}
          <section>
            <h2 className="text-2xl font-bold mb-2 text-center">The Team</h2>
            <p className="text-muted-foreground text-center mb-8">
              A small, focused team passionate about Nepal and technology.
            </p>
            <div className="grid sm:grid-cols-3 gap-6">
              {TEAM.map((member) => (
                <Card key={member.name + member.role}>
                  <CardContent className="p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <span className="text-primary font-bold text-lg">{member.initials}</span>
                    </div>
                    <p className="font-semibold">{member.name}</p>
                    <p className="text-sm text-muted-foreground">{member.role}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Nepal Context */}
          <section className="p-8 bg-primary/5 border border-primary/20 rounded-2xl">
            <h2 className="text-xl font-bold mb-3">Nepal Tourism in Numbers</h2>
            <div className="grid sm:grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-3xl font-bold text-primary">1M+</p>
                <p className="text-sm text-muted-foreground mt-1">Tourists annually</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-primary">8</p>
                <p className="text-sm text-muted-foreground mt-1">of the world's 14 highest peaks</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-primary">7.9%</p>
                <p className="text-sm text-muted-foreground mt-1">of GDP from tourism</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}
