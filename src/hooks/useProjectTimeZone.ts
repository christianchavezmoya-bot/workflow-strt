import { useEffect, useState } from "react";
import { useAppSelector } from "../store/hooks";
import { projectService } from "../services/projectService";
import { isValidTimeZone } from "../utils/datetime";

/**
 * Resolve a project's IANA timezone for run/report display.
 * Reads Redux first; if missing or invalid, fetches the single project record.
 */
export function useProjectTimeZone(projectId: string | null | undefined): string | undefined {
  const fromRedux = useAppSelector((s) =>
    projectId ? s.projects.items.find((p) => p.id === projectId)?.timeZoneId : undefined,
  );
  const [fetched, setFetched] = useState<string | undefined>();

  const reduxValid = isValidTimeZone(fromRedux) ? fromRedux : undefined;

  useEffect(() => {
    if (!projectId) {
      setFetched(undefined);
      return;
    }
    if (reduxValid) {
      setFetched(undefined);
      return;
    }
    let cancelled = false;
    void projectService.getProject(projectId).then((project) => {
      if (!cancelled && isValidTimeZone(project?.timeZoneId)) {
        setFetched(project!.timeZoneId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, reduxValid]);

  return reduxValid ?? fetched;
}
