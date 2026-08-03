import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "../store/hooks";
import { projectService } from "../services/projectService";
import { isValidTimeZone } from "../utils/datetime";

/**
 * Resolve a project's IANA timezone for run/report display.
 * Reads Redux first; if missing or invalid, fetches the single project record.
 * Re-checks when projects sync from IndexedDB (native) or Redux updates.
 */
export function useProjectTimeZone(projectId: string | null | undefined): string | undefined {
  const fromRedux = useAppSelector((s) =>
    projectId ? s.projects.items.find((p) => p.id === projectId)?.timeZoneId : undefined,
  );
  const [fetched, setFetched] = useState<string | undefined>();

  const reduxValid = isValidTimeZone(fromRedux) ? fromRedux : undefined;

  const load = useCallback(async () => {
    if (!projectId) {
      setFetched(undefined);
      return;
    }
    if (reduxValid) {
      setFetched(undefined);
      return;
    }
    const project = await projectService.getProject(projectId);
    if (isValidTimeZone(project?.timeZoneId)) {
      setFetched(project!.timeZoneId);
    }
  }, [projectId, reduxValid]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!projectId) return;
    const handler = (e: Event) => {
      const items = (e as CustomEvent<{ items?: Array<{ id: string; timeZoneId?: string }> }>).detail?.items;
      const match = items?.find((p) => p.id === projectId);
      if (match && isValidTimeZone(match.timeZoneId)) {
        setFetched(match.timeZoneId);
      }
    };
    window.addEventListener("repo:projects:updated", handler);
    return () => window.removeEventListener("repo:projects:updated", handler);
  }, [projectId]);

  return reduxValid ?? fetched;
}
