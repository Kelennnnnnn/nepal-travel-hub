# Legal review checklist

Every page below restates the platform's actual product rules (booking flow, reservation fee,
cancellation windows, liability posture) — nothing here invents a new legal obligation. None of it
has been reviewed by a Nepal-qualified lawyer. A dev-only "LEGAL REVIEW REQUIRED" banner
(`src/components/legal/LegalReviewBanner.tsx`) renders at the top of each page below except
production (gated by `VITE_APP_ENV`), as a reminder that this content is still a draft.

Before launch, a Nepal-qualified lawyer must review:

## Terms of Service (`src/pages/TermsOfService.tsx`)

- **§3 Bookings & Payments** — the reservation-fee checkout flow and the claim that the Platform
  is not a party to the traveler/agency contract.
- **§4 Cancellation Policy** — the free-cancellation windows (currently `fee_free_cancel_hours_day`
  / `fee_free_cancel_hours_multiday`, admin-configurable in `platform_settings`) and that the
  reservation fee is non-refundable outside that window.
- **§5 Reservation Fee** — the fee is charged to the traveler, not the agency, at the rate in
  `platform_settings.reservation_fee_percent`. Confirm this framing (a traveler-paid booking fee
  rather than an agency commission) carries no different tax/regulatory treatment in Nepal than a
  commission would.
- **§6 Limitation of Liability** — the marketplace-intermediary disclaimer and the carve-outs for
  agency/guide conduct and force majeure. Confirm enforceability under Nepali contract law.
- **§8 Governing Law** — exclusive jurisdiction of the Kathmandu courts.

## Cancellation Policy (`src/pages/CancellationPolicy.tsx`)

- The reservation-fee refund windows and the statement that a balance paid in advance follows the
  agency's own cancellation policy (not the Platform's).
- The agency-initiated-cancellation full-refund guarantee.
- The force-majeure handling and the Platform's role mediating disputes in good faith — confirm
  this doesn't create an unintended arbitration or dispute-resolution obligation.

## Privacy Policy (`src/pages/PrivacyPolicy.tsx`)

- **§1 Data We Collect**, **§5 Data Sharing & Disclosure**, **§6 Data Retention**, **§7 Your
  Rights** — confirm these satisfy Nepal's data-protection requirements (and any applicable
  foreign regime for non-Nepali travelers, e.g. GDPR if EU residents are a meaningful user base).
- The payment-provider paragraph is a placeholder (`// TODO` in the source) until a provider is
  chosen — must be finalized and reviewed before launch, not just left as a generic statement.
- The 30-day account-deletion data retention window and the stated exceptions for legal/accounting
  records.

## Cookie Policy (`src/pages/CookiePolicy.tsx`)

- The cookie categories and retention periods (session vs. up to 12 months persistent).
- Whether a cookie-consent banner (not currently implemented) is required for Nepal's regulatory
  posture or for any non-Nepali audience the product serves.

## FAQ (`src/pages/FAQ.tsx`)

- The cancellation-policy and payment-security answers, which are now generated from the same
  settings as the Cancellation Policy page but have not themselves been reviewed as standalone
  legal statements.

## Not yet written — flag if introduced before launch

- Any dispute-resolution / arbitration clause beyond "courts of Kathmandu" (Terms §8).
- Any agency-facing terms of service (a separate document from the traveler-facing Terms above);
  agencies currently only agree to onboarding/verification terms, not a published ToS page.
