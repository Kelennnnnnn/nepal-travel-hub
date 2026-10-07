import { useState } from "react";
import { Mail, Phone, MapPin } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { SEO } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { invokeEdge } from "@/lib/edge";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { useSiteContent } from "@/hooks/useSiteContent";

export default function Contact() {
  const { platform_name: platformName, support_email: supportEmail, support_phone: supportPhone, support_hours: supportHours } = usePlatformSettings();
  const { intro } = useSiteContent("contact_page", {
    intro: "Have a question or need help planning your trip? We're here for you.",
  });
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sending, setSending] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  // Bumping this remounts the widget after each submit (success or failure)
  // — Turnstile tokens are single-use, so the widget always needs a fresh
  // render before the next submission can succeed.
  const [turnstileKey, setTurnstileKey] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnstileToken) {
      toast.error("Please complete the verification check.");
      return;
    }
    setSending(true);
    // contact-form has no signed-in caller to key an idempotency record on
    // (the server-side helper requires a userId) — no Idempotency-Key
    // benefit here, but invokeEdge still surfaces the real error message
    // (e.g. the rate-limit sentence) instead of a generic fallback.
    const { error } = await invokeEdge("contact-form", { body: { ...form, turnstileToken } });
    setSending(false);
    setTurnstileToken("");
    setTurnstileKey((k) => k + 1);
    if (error) {
      toast.error(error.message || "Failed to send message. Please try again.");
      return;
    }
    toast.success("Message sent! We'll reply within one business day.");
    setForm({ name: "", email: "", subject: "", message: "" });
  };

  return (
    <Layout>
      <SEO title="Contact Us" description={`Get in touch with the ${platformName} team. We're here to help with your Nepal travel questions.`} />
      <div className="pt-32 pb-16 min-h-screen bg-muted/30">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-3">Contact Us</h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              {intro}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-10">
            {/* Contact Form */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold mb-5">Send a Message</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      placeholder="Your full name"
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      placeholder="How can we help?"
                      value={form.subject}
                      onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      placeholder="Tell us how we can help..."
                      rows={5}
                      value={form.message}
                      onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                      required
                    />
                  </div>
                  <TurnstileWidget
                    key={turnstileKey}
                    onVerify={setTurnstileToken}
                    onExpire={() => setTurnstileToken("")}
                  />
                  <Button type="submit" className="w-full" disabled={sending || !turnstileToken}>
                    {sending ? "Sending..." : "Send Message"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Contact Details */}
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-5">Get in Touch</h2>
                <p className="text-muted-foreground mb-6">
                  Our support team is available {supportHours}. We typically
                  respond to all enquiries within one business day.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Email</p>
                    <a
                      href={`mailto:${supportEmail}`}
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      {supportEmail}
                    </a>
                  </div>
                </div>

                {supportPhone && (
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Phone className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Phone</p>
                      <p className="text-muted-foreground">{supportPhone}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{supportHours}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Office</p>
                    <p className="text-muted-foreground">Thamel, Kathmandu</p>
                    <p className="text-muted-foreground">Nepal, 44600</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
