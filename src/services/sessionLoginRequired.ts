/**
 * Set when the server rejected the JWT (401) or sync flagged token-expired.
 * Sticky until auth-change clears it — prevents flaky network checks from
 * reverting the Login gate back to Face ID / dashboard.
 */
let required = false;

export function markSessionLoginRequired(): void {
  required = true;
}

export function clearSessionLoginRequired(): void {
  required = false;
}

export function isSessionLoginRequired(): boolean {
  return required;
}

if (typeof window !== "undefined") {
  window.addEventListener("api-auth-error", () => {
    markSessionLoginRequired();
  });
  window.addEventListener("auth-change", () => {
    clearSessionLoginRequired();
  });
}
