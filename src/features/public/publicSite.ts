/** Shared constants for the public (no-login) Support and Privacy pages. */

export const PUBLIC_SITE_ORIGIN = "https://www.strata-ngo.com";
export const PRIVACY_URL = `${PUBLIC_SITE_ORIGIN}/privacy`;
export const SUPPORT_URL = `${PUBLIC_SITE_ORIGIN}/support`;

/**
 * Approved public support contact. Do not swap for the noreply sender
 * (noreply@strata-ngo.com), which is outbound-only.
 * Deployment gate: confirm this mailbox exists and receives mail (Cloudflare
 * Email Routing rule + verified destination) before publishing these pages.
 */
export const SUPPORT_EMAIL = "support@strata-ngo.com";

export const PRIVACY_LAST_UPDATED = "21 September 2026";
