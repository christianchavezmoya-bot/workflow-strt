import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shouldSkipBlockingFetch } from "../../services/connectivityMonitor";
import {
  projectAssetService,
  type DashboardWorkspace,
} from "../../services/projectAssetService";
import {
  dashboardWorkspaceHasRows,
  mergeDashboardWorkspace,
} from "../../utils/dashboardWorkspaceMerge";
import { get as dcGet, put as dcPut, DASHBOARD_CACHE_KEYS } from "../../services/dashboardCache";

const ALL_DASHBOARDS_VALUE = "__all__";
const DASHBOARD_WORKSPACE_SESSION_PREFIX = "dashboard:web:workspace:";

const EMPTY_DASHBOARD_WORKSPACE: DashboardWorkspace = {
  currentInstalls: [],
  currentInspections: [],
  installHistory: [],
  inspectionHistory: [],
};

export type UseDashboardWorkspaceParams = {
  isAuthenticated: boolean;
  isNativePlatform: boolean;
  isViewer: boolean;
  isManager: boolean;
  userId: string;
  selectedDashboardId: string;
  shouldUseDashboardWorkspaceSessionCache: boolean;
};

export function useDashboardWorkspace({
  isAuthenticated,
  isNativePlatform,
  isViewer,
  isManager,
  userId,
  selectedDashboardId,
  shouldUseDashboardWorkspaceSessionCache,
}: UseDashboardWorkspaceParams) {
  const [dashboardWorkspace, setDashboardWorkspace] = useState<DashboardWorkspace>(EMPTY_DASHBOARD_WORKSPACE);
  const dashboardWorkspaceRef = useRef<DashboardWorkspace>(EMPTY_DASHBOARD_WORKSPACE);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [cacheHydrated, setCacheHydrated] = useState(false);
  const [dashboardBootPhase, setDashboardBootPhase] = useState<"workspace" | "full">("workspace");

  const unlockDeferredDashboardBoot = useCallback(() => {
    setDashboardBootPhase((current) => (current === "full" ? current : "full"));
  }, []);

  useEffect(() => {
    dashboardWorkspaceRef.current = dashboardWorkspace;
  }, [dashboardWorkspace]);

  const dashboardWorkspaceScopeId =
    isManager && selectedDashboardId !== ALL_DASHBOARDS_VALUE ? selectedDashboardId : undefined;
  const effectiveDashboardWorkspaceUserId =
    isManager && selectedDashboardId === ALL_DASHBOARDS_VALUE
      ? undefined
      : (dashboardWorkspaceScopeId ?? userId);
  const dashboardWorkspaceSessionKey = useMemo(
    () => `${DASHBOARD_WORKSPACE_SESSION_PREFIX}${userId || "anonymous"}:${dashboardWorkspaceScopeId ?? "self"}`,
    [dashboardWorkspaceScopeId, userId],
  );

  const readCachedDashboardWorkspace = useCallback((): DashboardWorkspace | null => {
    if (isNativePlatform) {
      return dcGet<DashboardWorkspace>(DASHBOARD_CACHE_KEYS.dashboardWorkspace);
    }
    if (!shouldUseDashboardWorkspaceSessionCache) return null;
    if (!userId) return null;
    try {
      const raw = window.sessionStorage.getItem(dashboardWorkspaceSessionKey);
      return raw ? (JSON.parse(raw) as DashboardWorkspace) : null;
    } catch {
      return null;
    }
  }, [dashboardWorkspaceSessionKey, isNativePlatform, shouldUseDashboardWorkspaceSessionCache, userId]);

  const writeCachedDashboardWorkspace = useCallback((data: DashboardWorkspace) => {
    if (isNativePlatform) {
      dcPut(DASHBOARD_CACHE_KEYS.dashboardWorkspace, data);
      return;
    }
    if (!shouldUseDashboardWorkspaceSessionCache) return;
    if (!userId) return;
    try {
      window.sessionStorage.setItem(dashboardWorkspaceSessionKey, JSON.stringify(data));
    } catch {
      // Ignore storage unavailability/quota errors.
    }
  }, [dashboardWorkspaceSessionKey, isNativePlatform, shouldUseDashboardWorkspaceSessionCache, userId]);

  const applyDashboardWorkspace = useCallback((
    data: DashboardWorkspace,
    options?: { persist?: boolean; stabilize?: boolean },
  ) => {
    const previous = dashboardWorkspaceRef.current;
    const next = mergeDashboardWorkspace(previous, data, {
      stabilize: options?.stabilize ?? true,
    });
    dashboardWorkspaceRef.current = next;
    setDashboardWorkspace(next);
    if (options?.persist === false) return;
    if (dashboardWorkspaceHasRows(previous) && !dashboardWorkspaceHasRows(next)) return;
    writeCachedDashboardWorkspace(next);
  }, [writeCachedDashboardWorkspace]);

  const seedNativeDashboardWorkspaceFromLocal = useCallback(() => {
    if (!isNativePlatform) return;

    void projectAssetService.dashboardWorkspaceLocal(effectiveDashboardWorkspaceUserId)
      .then((data) => {
        if (!dashboardWorkspaceHasRows(data)) return;
        applyDashboardWorkspace(data, { persist: false, stabilize: true });
        setCacheHydrated(true);
        setWorkspaceLoading(false);
      })
      .catch(() => {});
  }, [applyDashboardWorkspace, effectiveDashboardWorkspaceUserId, isNativePlatform]);

  useEffect(() => {
    if (!isNativePlatform) return;
    const cached = dcGet<DashboardWorkspace>(DASHBOARD_CACHE_KEYS.dashboardWorkspace);
    if (cached && dashboardWorkspaceHasRows(cached)) {
      applyDashboardWorkspace(cached, { persist: false, stabilize: true });
      setCacheHydrated(true);
    }
  }, [applyDashboardWorkspace, isNativePlatform]);

  useEffect(() => {
    if (isNativePlatform || !isAuthenticated || !userId) return;
    const cached = readCachedDashboardWorkspace();
    if (!cached || !dashboardWorkspaceHasRows(cached)) return;
    applyDashboardWorkspace(cached, { persist: false, stabilize: true });
    setCacheHydrated(true);
  }, [applyDashboardWorkspace, isAuthenticated, isNativePlatform, readCachedDashboardWorkspace, userId]);

  useEffect(() => {
    if (!isAuthenticated) return;

    if (isViewer) {
      setDashboardWorkspace(EMPTY_DASHBOARD_WORKSPACE);
      dashboardWorkspaceRef.current = EMPTY_DASHBOARD_WORKSPACE;
      unlockDeferredDashboardBoot();
      return;
    }

    let cancelled = false;
    setWorkspaceLoading(true);

    const restoreCachedWorkspace = () => {
      const cached = readCachedDashboardWorkspace();
      if (!cached || !dashboardWorkspaceHasRows(cached)) return;
      if (dashboardWorkspaceHasRows(dashboardWorkspaceRef.current)) return;
      applyDashboardWorkspace(cached, { persist: false, stabilize: true });
      setCacheHydrated(true);
    };

    if (isNativePlatform && shouldSkipBlockingFetch()) {
      void (async () => {
        restoreCachedWorkspace();
        try {
          const data = await projectAssetService.dashboardWorkspaceOfflineFirst(
            effectiveDashboardWorkspaceUserId,
          );
          if (cancelled) return;
          if (dashboardWorkspaceHasRows(data)) {
            applyDashboardWorkspace(data, { stabilize: true });
            setCacheHydrated(true);
          }
        } catch {
          // offlineFirst already falls back to dashboardWorkspaceLocal internally.
        } finally {
          if (!cancelled) {
            setWorkspaceLoading(false);
            unlockDeferredDashboardBoot();
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    seedNativeDashboardWorkspaceFromLocal();

    const fetchWorkspaceWithRetry = async (
      options?: { light?: boolean; attempts?: number },
    ): Promise<DashboardWorkspace> => {
      if (shouldSkipBlockingFetch()) throw new Error("dashboard-workspace-offline");

      const maxAttempts = options?.attempts ?? 3;
      let lastErr: unknown;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          return await projectAssetService.dashboardWorkspace(effectiveDashboardWorkspaceUserId, options);
        } catch (err) {
          lastErr = err;
          if (cancelled) throw err;
          if (attempt === maxAttempts - 1) break;
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        }
      }
      throw lastErr;
    };

    void (async () => {
      restoreCachedWorkspace();

      try {
        const initialData = await fetchWorkspaceWithRetry({ light: true, attempts: 1 });
        if (cancelled) return;
        applyDashboardWorkspace(initialData, { stabilize: true });
      } catch {
        if (cancelled) return;
        restoreCachedWorkspace();
      } finally {
        if (!cancelled) {
          setWorkspaceLoading(false);
          unlockDeferredDashboardBoot();
        }
      }

      if (cancelled) return;
      if (isNativePlatform) {
        await new Promise((resolve) => setTimeout(resolve, 900));
        if (cancelled) return;
      }

      try {
        const fullData = await fetchWorkspaceWithRetry();
        if (cancelled) return;
        applyDashboardWorkspace(fullData);
      } catch {
        // Keep the lighter or cached workspace on screen if the full refresh fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    applyDashboardWorkspace,
    effectiveDashboardWorkspaceUserId,
    isAuthenticated,
    isNativePlatform,
    isViewer,
    readCachedDashboardWorkspace,
    seedNativeDashboardWorkspaceFromLocal,
    unlockDeferredDashboardBoot,
  ]);

  return {
    dashboardWorkspace,
    dashboardWorkspaceRef,
    workspaceLoading,
    setWorkspaceLoading,
    cacheHydrated,
    setCacheHydrated,
    dashboardBootPhase,
    unlockDeferredDashboardBoot,
    applyDashboardWorkspace,
    readCachedDashboardWorkspace,
    seedNativeDashboardWorkspaceFromLocal,
    effectiveDashboardWorkspaceUserId,
    dashboardWorkspaceScopeId,
  };
}
