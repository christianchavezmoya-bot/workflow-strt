import {
  firstValidTimeZone,
  inferTimeZoneFromLocation,
  inferTimeZoneFromOfficeLabel,
} from "./officeTimeZone";

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

/** Project fields used to infer site timezone for reports and public pages (sync, no network). */
export type ProjectTimeZoneSource = {
  timeZoneId?: string | null;
  office?: string | null;
  officeId?: string | null;
  region?: string | null;
  officeCountry?: string | null;
  officeState?: string | null;
};

/** Infer site IANA zone from explicit id, office label, or region — without async office lookup. */
export function inferProjectTimeZoneSync(
  source: ProjectTimeZoneSource | null | undefined,
): string | undefined {
  if (!source) return undefined;
  if (isValidTimeZone(source.timeZoneId)) return source.timeZoneId;

  if (source.officeCountry || source.officeState) {
    const fromOfficeEntity = inferTimeZoneFromLocation(source.officeCountry, source.officeState);
    if (isValidTimeZone(fromOfficeEntity)) return fromOfficeEntity;
  }

  const fromLabel = inferTimeZoneFromOfficeLabel(source.office);
  if (isValidTimeZone(fromLabel)) return fromLabel;

  const fromRegion = inferTimeZoneFromLocation(source.region, undefined);
  if (isValidTimeZone(fromRegion)) return fromRegion;

  return undefined;
}

/** Resolve the zone reports and customer-facing pages should render in. Falls back to UTC only when unknown. */
export function resolveReportTimeZone(
  source: ProjectTimeZoneSource | null | undefined,
): string {
  return inferProjectTimeZoneSync(source) ?? UTC_ZONE;
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
/** Parse an API/DB instant as UTC even when the string omits a Z suffix (common ASP.NET DateTime). */
export function parseUtcInstant(
  isoUtc: string | number | Date | null | undefined,
): Date | null {
  if (isoUtc === null || isoUtc === undefined || isoUtc === "") return null;
  if (isoUtc instanceof Date) return Number.isNaN(isoUtc.getTime()) ? null : isoUtc;
  if (typeof isoUtc === "number") {
    const d = new Date(isoUtc);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const trimmed = isoUtc.trim();
  if (!trimmed) return null;
  const hasZone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed);
  const d = new Date(hasZone ? trimmed : `${trimmed}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatInstant(
  isoUtc: string | number | Date | null | undefined,
  timeZoneId?: string | null,
  options: FormatInstantOptions = {},
): string {
  if (isoUtc === null || isoUtc === undefined || isoUtc === "") return "";
  const d = parseUtcInstant(isoUtc);
  if (!d) return "";

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

function zonedWallClockParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get("hour");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: hour === 24 ? 0 : hour,
    minute: get("minute"),
    second: get("second"),
  };
}

/** UTC ISO → `datetime-local` value rendered in the project zone (not device local). */
export function utcToDatetimeLocalInZone(
  isoUtc: string | null | undefined,
  timeZoneId?: string | null,
): string {
  if (!isoUtc) return "";
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return "";
  const zone = resolveProjectTimeZone(timeZoneId);
  const p = zonedWallClockParts(d, zone);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** `datetime-local` wall clock in the project zone → UTC ISO. */
export function datetimeLocalInZoneToUtc(
  localStr: string,
  timeZoneId?: string | null,
): string {
  if (!localStr) return "";
  const zone = resolveProjectTimeZone(timeZoneId);
  const [datePart, timePart] = localStr.split("T");
  if (!datePart || !timePart) return new Date(localStr).toISOString();
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return new Date(localStr).toISOString();

  let utcGuess = Date.UTC(y, mo - 1, d, h, mi, 0);
  for (let i = 0; i < 4; i++) {
    const p = zonedWallClockParts(new Date(utcGuess), zone);
    const targetMs = Date.UTC(y, mo - 1, d, h, mi, 0);
    const actualMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
    utcGuess += targetMs - actualMs;
  }
  return new Date(utcGuess).toISOString();
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

/**
 * Compact wall clock for mobile headers and asset tables: DD/MM/YY HH:MM in the
 * given IANA zone, no timezone suffix.
 */
export function formatCompactWallClock(
  isoUtc: string | number | Date | null | undefined,
  timeZoneId?: string | null,
): string {
  if (isoUtc === null || isoUtc === undefined || isoUtc === "") return "";
  const d = isoUtc instanceof Date ? isoUtc : new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return "";

  const zone = resolveProjectTimeZone(timeZoneId);
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "";
    const date = `${get("day")}/${get("month")}/${get("year")}`;
    const time = `${get("hour")}:${get("minute")}`;
    return `${date} ${time}`;
  } catch {
    return formatInstant(isoUtc, zone, { withZone: false });
  }
}
