import { isValidTimeZone } from "./datetime";

/** Map global-office country/state to a primary IANA zone for diagnostic clocks and project fallbacks. */
export function inferTimeZoneFromLocation(
  country?: string | null,
  state?: string | null,
): string | undefined {
  const c = (country ?? "").trim().toLowerCase();
  const s = (state ?? "").trim().toLowerCase();
  if (!c) return undefined;

  if (c.includes("australia") || c === "au") {
    if (/(^|\b)(wa|western australia)\b/.test(s)) return "Australia/Perth";
    if (/(^|\b)(qld|queensland)\b/.test(s)) return "Australia/Brisbane";
    if (/(^|\b)(nt|northern territory)\b/.test(s)) return "Australia/Darwin";
    if (/(^|\b)(sa|south australia)\b/.test(s)) return "Australia/Adelaide";
    return "Australia/Sydney";
  }
  if (c.includes("united states") || c === "usa" || c === "us") {
    if (/(pacific|ca|california|wa|washington|or|oregon|nv|nevada)/.test(s)) return "America/Los_Angeles";
    if (/(mountain|co|colorado|ut|utah|az|arizona|mt|montana)/.test(s)) return "America/Denver";
    if (/(central|tx|texas|il|illinois|mn|minnesota|mo|missouri)/.test(s)) return "America/Chicago";
    return "America/New_York";
  }
  if (c.includes("united kingdom") || c === "uk" || c.includes("britain")) return "Europe/London";
  if (c.includes("canada")) {
    if (/(bc|british columbia|pacific)/.test(s)) return "America/Vancouver";
    if (/(ab|alberta|mountain)/.test(s)) return "America/Edmonton";
    if (/(mb|manitoba|central|sk|saskatchewan)/.test(s)) return "America/Winnipeg";
    if (/(atlantic|nb|ns|pei|nl)/.test(s)) return "America/Halifax";
    return "America/Toronto";
  }
  if (c.includes("south africa")) return "Africa/Johannesburg";
  if (c.includes("india")) return "Asia/Kolkata";
  if (c.includes("singapore")) return "Asia/Singapore";
  if (c.includes("japan")) return "Asia/Tokyo";
  if (c.includes("china")) return "Asia/Shanghai";
  if (c.includes("uae") || c.includes("emirates")) return "Asia/Dubai";
  if (c.includes("new zealand")) return "Pacific/Auckland";
  if (c.includes("brazil")) return "America/Sao_Paulo";
  if (c.includes("mexico")) return "America/Mexico_City";
  if (c.includes("spain")) return "Europe/Madrid";
  if (c.includes("france")) return "Europe/Paris";
  if (c.includes("germany")) return "Europe/Berlin";
  return undefined;
}

/** Resolve a zone id from a free-form office label (city, "City, Country", country name, etc.). */
export function inferTimeZoneFromOfficeLabel(officeLabel?: string | null): string | undefined {
  if (!officeLabel?.trim()) return undefined;
  const parts = officeLabel.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return inferTimeZoneFromLocation(parts[parts.length - 1], parts[parts.length - 2]);
  }
  return inferTimeZoneFromLocation(officeLabel, undefined);
}

export function firstValidTimeZone(...candidates: Array<string | null | undefined>): string | undefined {
  for (const c of candidates) {
    if (isValidTimeZone(c)) return c!;
  }
  return undefined;
}
