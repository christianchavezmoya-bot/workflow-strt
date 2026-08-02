// Timezone-aware date/time rendering.
//
// Instants are always stored and transported in UTC (ISO-8601 with a Z). Wall-clock
// display, especially in reports shared across global offices, must render in a single
// deterministic zone — the project's site timezone — so everyone reads the same times.
// This module is the one place that turns a UTC instant + an IANA zone into a string.
//
// Never store or transport local times; only render them here.

export const UTC_ZONE = "UTC";

/** The viewer's own IANA timezone (e.g. "Australia/Sydney"). Safe default for new projects. */
export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || UTC_ZONE;
  } catch {
    return UTC_ZONE;
  }
}

/** True if the runtime accepts this IANA zone id. Guards against stale/garbage values. */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve which zone to render a project's timestamps in:
 * the project's site zone if set and valid, otherwise UTC (never silently the device zone,
 * so a report reads identically no matter who opens it).
 */
export function resolveProjectTimeZone(timeZoneId: string | null | undefined): string {
  return isValidTimeZone(timeZoneId) ? timeZoneId : UTC_ZONE;
}

/** Full IANA zone list for pickers; falls back to a curated set on older runtimes. */
export function listTimeZones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
    .supportedValuesOf;
  if (typeof supported === "function") {
    try {
      return supported("timeZone");
    } catch {
      /* fall through */
    }
  }
  return [
    "UTC",
    "America/Los_Angeles",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "America/Sao_Paulo",
    "Europe/London",
    "Europe/Paris",
    "Europe/Madrid",
    "Africa/Johannesburg",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Perth",
    "Australia/Sydney",
    "Pacific/Auckland",
  ];
}

export interface FormatInstantOptions {
  /** Include the date part (default true). */
  date?: boolean;
  /** Include the time part (default true). */
  time?: boolean;
  /** Append the zone abbreviation, e.g. "AEST" (default true) so the value is unambiguous. */
  withZone?: boolean;
  /** Locale for formatting (default: runtime default). */
  locale?: string;
}

/**
 * Render a UTC instant in a specific IANA zone.
 *
 * @param isoUtc  A UTC instant (ISO-8601, e.g. "2026-08-02T04:30:00Z" or a Date).
 * @param timeZoneId  IANA zone (e.g. "Australia/Sydney"); invalid/empty falls back to UTC.
 * @returns e.g. "2 Aug 2026, 2:30 PM AEST" — or "" if the instant can't be parsed.
 */
export function formatInstant(
  isoUtc: string | number | Date | null | undefined,
  timeZoneId?: string | null,
  options: FormatInstantOptions = {},
): string {
  if (isoUtc === null || isoUtc === undefined || isoUtc === "") return "";
  const d = isoUtc instanceof Date ? isoUtc : new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return "";

  const { date = true, time = true, withZone = true, locale } = options;
  const zone = resolveProjectTimeZone(timeZoneId);

  const fmtOpts: Intl.DateTimeFormatOptions = { timeZone: zone };
  if (date) {
    fmtOpts.year = "numeric";
    fmtOpts.month = "short";
    fmtOpts.day = "numeric";
  }
  if (time) {
    fmtOpts.hour = "numeric";
    fmtOpts.minute = "2-digit";
  }
  if (withZone && time) {
    fmtOpts.timeZoneName = "short";
  }

  try {
    return new Intl.DateTimeFormat(locale, fmtOpts).format(d);
  } catch {
    // Extremely defensive: bad zone slipped through — render in UTC with an explicit marker.
    const utcOpts = { ...fmtOpts, timeZone: UTC_ZONE };
    try {
      return new Intl.DateTimeFormat(locale, utcOpts).format(d);
    } catch {
      return d.toISOString();
    }
  }
}

/** Short zone label alone, e.g. "AEST", for report headers ("All times in Australia/Sydney (AEST)"). */
export function zoneAbbreviation(timeZoneId?: string | null, at?: string | number | Date): string {
  const zone = resolveProjectTimeZone(timeZoneId);
  const d = at ? (at instanceof Date ? at : new Date(at)) : new Date();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "short",
    }).formatToParts(Number.isNaN(d.getTime()) ? new Date() : d);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? zone;
  } catch {
    return zone;
  }
}
