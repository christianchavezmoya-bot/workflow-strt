import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "../store/hooks";
import { projectService } from "../services/projectService";
import { officesService } from "../services/officesService";
import { isValidTimeZone } from "../utils/datetime";
import {
  firstValidTimeZone,
  inferTimeZoneFromLocation,
  inferTimeZoneFromOfficeLabel,
} from "../utils/officeTimeZone";

async function inferProjectTimeZone(
  project: { timeZoneId?: string; office?: string; officeId?: string; region?: string } | null | undefined,
): Promise<string | undefined> {
  if (!project) return undefined;
  if (isValidTimeZone(project.timeZoneId)) return project.timeZoneId;

  if (project.officeId) {
    try {
      const offices = await officesService.getAll();
      const office = offices.find((o) => o.id === project.officeId);
      const fromOffice = inferTimeZoneFromLocation(office?.country, office?.state);
      if (isValidTimeZone(fromOffice)) return fromOffice;
    } catch {
      /* non-blocking */
    }
  }

  const fromLabel = inferTimeZoneFromOfficeLabel(project.office);
  if (isValidTimeZone(fromLabel)) return fromLabel;

  const fromRegion = inferTimeZoneFromLocation(project.region, undefined);
  if (isValidTimeZone(fromRegion)) return fromRegion;

  return undefined;
}

/**
 * Resolve a project's IANA timezone for run/report display.
 * Reads Redux first; if missing or invalid, fetches the single project record.
 * Falls back to the project's global office location when timeZoneId is unset.
 * Re-checks when projects sync from IndexedDB (native) or Redux updates.
 */
export function useProjectTimeZone(projectId: string | null | undefined): string | undefined {
  const projectFromRedux = useAppSelector((s) =>
    projectId ? s.projects.items.find((p) => p.id === projectId) : undefined,
  );
  const fromRedux = projectFromRedux?.timeZoneId;
  const [fetched, setFetched] = useState<string | undefined>();
  const [inferred, setInferred] = useState<string | undefined>();

  const reduxValid = isValidTimeZone(fromRedux) ? fromRedux : undefined;

  const load = useCallback(async () => {
    if (!projectId) {
      setFetched(undefined);
      setInferred(undefined);
      return;
    }
    if (reduxValid) {
      setFetched(undefined);
      setInferred(undefined);
      return;
    }

    const inferredFromRedux = await inferProjectTimeZone(projectFromRedux);
    if (isValidTimeZone(inferredFromRedux)) {
      setInferred(inferredFromRedux);
    }

    const project = await projectService.getProject(projectId);
    const resolved = firstValidTimeZone(
      project?.timeZoneId,
      await inferProjectTimeZone(project),
      inferredFromRedux,
    );
    if (isValidTimeZone(resolved)) {
      if (isValidTimeZone(project?.timeZoneId)) {
        setFetched(project!.timeZoneId);
        setInferred(undefined);
      } else {
        setInferred(resolved);
        setFetched(undefined);
      }
    }
  }, [projectId, projectFromRedux, reduxValid]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!projectId) return;
    const handler = (e: Event) => {
      const items = (e as CustomEvent<{ items?: Array<{ id: string; timeZoneId?: string; office?: string; officeId?: string; region?: string }> }>).detail?.items;
      const match = items?.find((p) => p.id === projectId);
      if (!match) return;
      if (isValidTimeZone(match.timeZoneId)) {
        setFetched(match.timeZoneId);
        setInferred(undefined);
        return;
      }
      void inferProjectTimeZone(match).then((zone) => {
        if (isValidTimeZone(zone)) setInferred(zone);
      });
    };
    window.addEventListener("repo:projects:updated", handler);
    return () => window.removeEventListener("repo:projects:updated", handler);
  }, [projectId]);

  return reduxValid ?? fetched ?? inferred;
}
