/**
 * Base HTML shell for all Yatra Nepal transactional emails.
 *
 * Produces a 600-px table-based layout that renders correctly in:
 * Gmail, Outlook 2016+, Apple Mail, Yahoo Mail, and mobile clients.
 *
 * Inline CSS only — no <style> block (stripped by many clients).
 */

const BRAND_GREEN = "#16a34a";
const TEXT_PRIMARY = "#111827";
const TEXT_MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const BG_OUTER = "#f3f4f6";
const BG_CARD = "#ffffff";
const BG_FOOTER = "#f9fafb";

export function renderEmail(content: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <!--[if mso]><style>table{border-collapse:collapse;}td{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BG_OUTER};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!-- Outer wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
    style="background-color:${BG_OUTER};padding:40px 16px;">
    <tr>
      <td align="center">
        <!-- Card -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
          style="max-width:600px;width:100%;background-color:${BG_CARD};border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">

          <!-- ── Header ── -->
          <tr>
            <td style="background-color:${BG_CARD};padding:28px 40px 20px;border-bottom:2px solid ${BRAND_GREEN};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:${BRAND_GREEN};border-radius:8px;padding:7px 8px;vertical-align:middle;line-height:1;">
                    <span style="font-size:16px;color:#ffffff;font-weight:900;">&#9650;</span>
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span style="font-size:20px;font-weight:700;color:${TEXT_PRIMARY};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;letter-spacing:-0.3px;">Yatra Nepal</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td style="padding:36px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${TEXT_PRIMARY};">
              ${content}
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="background-color:${BG_FOOTER};padding:20px 40px;border-top:1px solid ${BORDER};text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 6px;font-size:12px;color:${TEXT_MUTED};">
                &copy; ${year} Yatra Nepal &middot; Kathmandu, Nepal
              </p>
              <p style="margin:0;font-size:12px;color:${TEXT_MUTED};">
                You received this email because you have an account on Yatra Nepal.
                <br />
                <a href="https://yatranepal.com/settings/notifications"
                  style="color:${TEXT_MUTED};text-decoration:underline;">Manage email preferences</a>
                &nbsp;&middot;&nbsp;
                <a href="https://yatranepal.com/privacy"
                  style="color:${TEXT_MUTED};text-decoration:underline;">Privacy Policy</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Shared button style — paste as style attribute value. */
export function btnStyle(color = BRAND_GREEN): string {
  return `display:inline-block;padding:12px 28px;background-color:${color};color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;line-height:1.4;`;
}

/** A horizontal rule divider. */
export const HR = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;"><tr><td style="border-top:1px solid #e5e7eb;font-size:0;">&nbsp;</td></tr></table>`;

/** A two-column key/value row inside a details table. */
export function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:9px 12px;font-size:13px;font-weight:600;color:#374151;background-color:#f9fafb;border-bottom:1px solid #f0f0f0;width:38%;vertical-align:top;">${label}</td>
    <td style="padding:9px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f0f0f0;vertical-align:top;">${value}</td>
  </tr>`;
}

/** Wraps rows produced by `row()` in a bordered table. */
export function detailsTable(rows: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
    style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:20px 0;">${rows}</table>`;
}

/** Alert banner — use for success (green), warning (amber), or danger (red). */
export function alertBanner(msg: string, type: "success" | "warning" | "danger" = "success"): string {
  const colors = {
    success: { bg: "#f0fdf4", border: "#86efac", text: "#15803d" },
    warning: { bg: "#fffbeb", border: "#fcd34d", text: "#b45309" },
    danger:  { bg: "#fef2f2", border: "#fca5a5", text: "#b91c1c" },
  };
  const c = colors[type];
  return `<div style="background-color:${c.bg};border:1px solid ${c.border};border-radius:8px;padding:14px 16px;margin-bottom:20px;">
    <p style="margin:0;font-size:14px;font-weight:600;color:${c.text};">${msg}</p>
  </div>`;
}
