import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";
import { escapeHtml } from "../_shared/html.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, subject, message } = await req.json();

    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ error: "Name, email and message are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Service-role client (bypasses RLS) — created up front so we can rate-limit
    // and persist the submission before sending any email.
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Rate limit: at most RATE_LIMIT_MAX submissions per email address per hour,
    // so the form can't be used to spam the support inbox or the user's own address.
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentCount } = await supabaseAdmin
      .from("contact_submissions")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since);

    if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
      return new Response(
        JSON.stringify({ error: "Too many messages sent recently. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Escape all user-supplied values before interpolating into HTML emails —
    // raw interpolation would let a crafted name/subject/message inject markup
    // or scripts into the recipient's mail client.
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = subject ? escapeHtml(subject) : "";
    const safeMessage = escapeHtml(message);

    // Send notification email to support inbox
    await sendEmail({
      to: "hello@yatranepal.com",
      subject: subject ? `Contact: ${subject}` : `New message from ${name}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#1a1a1a">New Contact Form Submission</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:8px 0;color:#666;width:100px"><strong>Name</strong></td>
              <td style="padding:8px 0">${safeName}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#666"><strong>Email</strong></td>
              <td style="padding:8px 0"><a href="mailto:${safeEmail}">${safeEmail}</a></td>
            </tr>
            ${safeSubject ? `
            <tr>
              <td style="padding:8px 0;color:#666"><strong>Subject</strong></td>
              <td style="padding:8px 0">${safeSubject}</td>
            </tr>` : ""}
          </table>
          <div style="margin-top:16px;padding:16px;background:#f5f5f5;border-radius:8px">
            <p style="margin:0;white-space:pre-wrap">${safeMessage}</p>
          </div>
          <p style="margin-top:16px;color:#999;font-size:12px">
            Sent via the Yatra Nepal contact form on ${new Date().toISOString()}.
          </p>
        </div>
      `,
    });

    // Send auto-reply to the user
    await sendEmail({
      to: email,
      subject: "We received your message — Yatra Nepal",
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#1a1a1a">Thanks for reaching out, ${safeName}!</h2>
          <p>We've received your message and will get back to you within one business day.</p>
          <p style="color:#666;font-style:italic">"${escapeHtml(message.slice(0, 200))}${message.length > 200 ? "…" : ""}"</p>
          <p>If your enquiry is urgent, you can also call us at <strong>+977 1-XXXXXXX</strong> (Sun–Fri, 9am–6pm NPT).</p>
          <p>— The Yatra Nepal Team</p>
        </div>
      `,
    });

    await supabaseAdmin.from("contact_submissions").insert({
      name,
      email,
      subject: subject ?? "",
      message,
      status: "new",
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("contact-form error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to send message. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
