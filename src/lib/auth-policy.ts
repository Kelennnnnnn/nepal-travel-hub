/**
 * Shared minimum password length for every password-setting flow (admin
 * change-password, signup, reset) — one constant so the rule can never
 * drift between pages the way the admin panel's hardcoded 8 did.
 */
export const PASSWORD_MIN_LENGTH = 10;
