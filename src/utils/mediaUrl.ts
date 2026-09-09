import { getApiBaseUrl } from "../services/apiBase";

/**
 * Resolves a possibly server-relative media URL (e.g.
 * "/api/workflow-configs/{configId}/media/{mediaId}/file", as returned by
 * WorkflowConfigsController's upload/list endpoints) to a URL a browser can
 * actually load.
 *
 * The frontend and API are commonly different origins (local dev — different
 * ports; staging/production — different subdomains: staging.strata-ngo.com
 * vs api.staging.strata-ngo.com). A bare relative path used directly as
 * <img src>/<a href>/<video src> resolves against window.location.origin
 * (the frontend), not the API — the request lands nowhere real, and on web
 * that surfaces as an SPA route miss that redirects away from the workflow.
 * This is the single place that mistake should be prevented.
 *
 * - Absolute URLs (http:, https:, data:, blob:, capacitor:, file:, content:,
 *   or any other URI scheme — e.g. an already-hydrated native offline cache
 *   entry, see configMediaCache.ts) are returned unchanged.
 * - A relative path is resolved against the API's *origin* only
 *   (scheme+host+port from getApiBaseUrl(), not its "/api" suffix) — the
 *   relative path already includes "/api/..." itself, so concatenating the
 *   origin (not the full base URL) avoids producing ".../api/api/...".
 */
const HAS_URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function resolveMediaUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (HAS_URI_SCHEME.test(url)) return url;
  try {
    const origin = new URL(getApiBaseUrl()).origin;
    return url.startsWith("/") ? `${origin}${url}` : `${origin}/${url}`;
  } catch {
    return url;
  }
}
