import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
              <td style="padding:8px 0">${name}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#666"><strong>Email</strong></td>
              <td style="padding:8px 0"><a href="mailto:${email}">${email}</a></td>
            </tr>
            ${subject ? `
            <tr>
              <td style="padding:8px 0;color:#666"><strong>Subject</strong></td>
              <td style="padding:8px 0">${subject}</td>
            </tr>` : ""}
          </table>
          <div style="margin-top:16px;padding:16px;background:#f5f5f5;border-radius:8px">
            <p style="margin:0;white-space:pre-wrap">${message}</p>
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
          <h2 style="color:#1a1a1a">Thanks for reaching out, ${name}!</h2>
          <p>We've received your message and will get back to you within one business day.</p>
          <p style="color:#666;font-style:italic">"${message.slice(0, 200)}${message.length > 200 ? "…" : ""}"</p>
          <p>If your enquiry is urgent, you can also call us at <strong>+977 1-XXXXXXX</strong> (Sun–Fri, 9am–6pm NPT).</p>
          <p>— The Yatra Nepal Team</p>
        </div>
      `,
    });

    // Persist submission to DB using service-role client (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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
