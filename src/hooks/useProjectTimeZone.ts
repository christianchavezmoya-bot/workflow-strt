import { useEffect, useState } from "react";
import { useAppSelector } from "../store/hooks";
import { projectService } from "../services/projectService";

/**
 * Resolve a project's IANA timezone for run/report display.
 * Reads Redux first; if missing (stale list cache, partial payload), fetches the single project.
 */
export function useProjectTimeZone(projectId: string | null | undefined): string | undefined {
  const fromRedux = useAppSelector((s) =>
    projectId ? s.projects.items.find((p) => p.id === projectId)?.timeZoneId : undefined,
  );
  const [fetched, setFetched] = useState<string | undefined>();

  useEffect(() => {
    if (!projectId || fromRedux) {
      setFetched(undefined);
      return;
    }
    let cancelled = false;
    void projectService.getProject(projectId).then((project) => {
      if (!cancelled && project?.timeZoneId) {
        setFetched(project.timeZoneId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, fromRedux]);

  return fromRedux ?? fetched;
}
