/** UUID when available (HTTPS/localhost); fallback for HTTP LAN dev (e.g. 172.20.x.x:5173). */
export function randomId(prefix?: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prefix ? `${prefix}-${suffix}` : suffix;
}
