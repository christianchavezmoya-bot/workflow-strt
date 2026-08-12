import { officesService } from "../services/officesService";
import {
  isValidTimeZone,
  resolveReportTimeZone,
  UTC_ZONE,
} from "./datetime";
import {
  inferTimeZoneFromLocation,
  inferTimeZoneFromOfficeLabel,
} from "./officeTimeZone";

export type ProjectTimeZoneSource = {
  timeZoneId?: string | null;
  office?: string | null;
  officeId?: string | null;
  region?: string | null;
};

/** Async project timezone for reports — resolves officeId via offices catalog. */
export async function resolveProjectTimeZoneForReport(
  project: ProjectTimeZoneSource | null | undefined,
): Promise<string> {
  if (!project) return UTC_ZONE;
  if (isValidTimeZone(project.timeZoneId)) return project.timeZoneId!;

  if (project.officeId) {
    try {
      const offices = await officesService.getAll();
      const office = offices.find((row) => row.id === project.officeId);
      const fromOffice = inferTimeZoneFromLocation(office?.country, office?.state);
      if (isValidTimeZone(fromOffice)) return fromOffice;
    } catch {
      // Non-blocking — fall through.
    }
  }

  const fromLabel = inferTimeZoneFromOfficeLabel(project.office ?? undefined);
  if (isValidTimeZone(fromLabel)) return fromLabel;

  const fromRegion = inferTimeZoneFromLocation(project.region ?? undefined, undefined);
  if (isValidTimeZone(fromRegion)) return fromRegion;

  const syncResolved = resolveReportTimeZone(project);
  return syncResolved || UTC_ZONE;
}
