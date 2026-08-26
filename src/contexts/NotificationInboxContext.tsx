import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { notificationService } from "../services/notificationService";
import { shouldSkipBlockingFetch } from "../services/connectivityMonitor";
import { useAuth } from "../hooks/useAuth";
import { isDashboardRoute } from "../utils/postLoginRoute";
import type { AppNotification } from "../types/notification";
import { isMobileNativePlatform } from "../utils/platform";
import {
  nativeBellShouldPoll,
  notificationPollingUsesVisibilityChange,
} from "../utils/notificationInboxPolling";
import { isFirstLoginQuietPending, waitForFirstLoginQuiet } from "../utils/postLoginQuietWindow";

const DASHBOARD_POLL_MS = 15_000;
const BACKGROUND_POLL_MS = 60_000;
/** If polling stopped during a connectivity blip, retry starting it periodically. */
const POLL_HEAL_MS = 15_000;

const ASSIGNMENT_EVENT_TYPES = new Set([
  "workflow-assigned", "workflow-assigned-to-installer", "workflow-self-assigned",
  "workflow-unassigned", "asset-created", "asset-assignment-updated",
  "asset-assigned", "asset-unassigned", "asset-takeover", "asset-self-assigned",
]);

const DASHBOARD_ASSIGNMENT_RECOVERY_KEY = "dashboard:pending-assignment-recovery";
const DASHBOARD_RUN_STATE_RECOVERY_KEY = "dashboard:pending-run-state-recovery";

function rememberDashboardRecoverySignal(storageKey: string) {
  try {
    window.sessionStorage.setItem(storageKey, "1");
  } catch {
    // Ignore storage/privacy-mode failures.
  }
}

const RUN_STATE_EVENT_TYPES = new Set([
  "workflow-started", "workflow-paused", "workflow-resumed", "workflow-completed",
  "asset-pending-installer-signature", "asset-completed", "asset-closed", "asset-signature-declined",
  "workflow-issue", "workflow-issues-updated", "workflow-reopened",
  "workflow-updated", "project-completed", "project-closed", "asset-deleted",
]);

type NotificationInboxContextValue = {
  notifications: AppNotification[];
  unreadNotifications: AppNotification[];
  bannerNotification: AppNotification | null;
  loading: boolean;
  fromCache: boolean;
  acknowledge: (notificationIds?: string[]) => Promise<void>;
  dismissBanner: () => void;
  refresh: () => Promise<void>;
};

const NotificationInboxContext = createContext<NotificationInboxContextValue | undefined>(undefined);

function bellPollingAllowed(useVisibilityPolling: boolean): boolean {
  if (shouldSkipBlockingFetch()) return false;
  if (useVisibilityPolling) {
    return document.visibilityState === "visible";
  }
  return nativeBellShouldPoll(true);
}

export function NotificationInboxProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const onDashboard = isDashboardRoute(location.pathname);
  const pollIntervalMs = onDashboard ? DASHBOARD_POLL_MS : BACKGROUND_POLL_MS;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [bannerNotification, setBannerNotification] = useState<AppNotification | null>(null);
  const seenUnreadIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const refresh = useCallback(async (options?: { forceNetwork?: boolean }) => {
    const path = window.location.pathname;
    const isPublicRoute =
      path === "/login" ||
      path === "/reset-password" ||
      path.startsWith("/sign/") ||
      path === "/mobile-upload";

    if (!isAuthenticated || !user?.id || isPublicRoute) {
      setNotifications([]);
      try {
        window.sessionStorage.removeItem(DASHBOARD_ASSIGNMENT_RECOVERY_KEY);
        window.sessionStorage.removeItem(DASHBOARD_RUN_STATE_RECOVERY_KEY);
      } catch {
        // Ignore storage/privacy-mode failures.
      }
      setBannerNotification(null);
      initializedRef.current = false;
      seenUnreadIdsRef.current = new Set();
      setFromCache(false);
      return;
    }

    const forceNetwork = options?.forceNetwork === true;
    const offlineRead = !forceNetwork && shouldSkipBlockingFetch();
    if (!offlineRead) setLoading(true);
    try {
      const next = await notificationService.list(true, 50, { forceNetwork });
      setNotifications(next);
      setFromCache(offlineRead);

      const unreadItems = next.filter((n) => !n.isRead);
      const unreadIds = new Set(unreadItems.map((n) => n.id));
      if (!initializedRef.current) {
        initializedRef.current = true;
        seenUnreadIdsRef.current = unreadIds;
        setBannerNotification(unreadItems[0] ?? null);

        const hasUnreadAssignmentEvent = unreadItems.some((n) => ASSIGNMENT_EVENT_TYPES.has(n.eventType));
        const hasUnreadRunStateEvent = unreadItems.some((n) => RUN_STATE_EVENT_TYPES.has(n.eventType));
        const dispatchRecovery = isDashboardRoute(window.location.pathname);
        if (hasUnreadAssignmentEvent && dispatchRecovery) {
          rememberDashboardRecoverySignal(DASHBOARD_ASSIGNMENT_RECOVERY_KEY);
          window.dispatchEvent(new Event("notifications:assignments-changed"));
        }
        if (hasUnreadRunStateEvent && dispatchRecovery) {
          rememberDashboardRecoverySignal(DASHBOARD_RUN_STATE_RECOVERY_KEY);
          window.dispatchEvent(new Event("notifications:run-state-changed"));
        }
        return;
      }

      const newestUnread = next.find((n) => !n.isRead && !seenUnreadIdsRef.current.has(n.id));
      seenUnreadIdsRef.current = unreadIds;
      if (newestUnread) {
        setBannerNotification(newestUnread);
        const dispatchRecovery = isDashboardRoute(window.location.pathname);
        if (dispatchRecovery && ASSIGNMENT_EVENT_TYPES.has(newestUnread.eventType)) {
          rememberDashboardRecoverySignal(DASHBOARD_ASSIGNMENT_RECOVERY_KEY);
          window.dispatchEvent(new Event("notifications:assignments-changed"));
        }
        if (dispatchRecovery && RUN_STATE_EVENT_TYPES.has(newestUnread.eventType)) {
          rememberDashboardRecoverySignal(DASHBOARD_RUN_STATE_RECOVERY_KEY);
          window.dispatchEvent(new Event("notifications:run-state-changed"));
        }
      }
    } catch (error) {
      console.error("Notification inbox refresh failed:", error);
      setFromCache(shouldSkipBlockingFetch());
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    let cancelled = false;

    const runInitialRefresh = async () => {
      if (isMobileNativePlatform() && isFirstLoginQuietPending()) {
        await waitForFirstLoginQuiet();
      }
      if (!cancelled) {
        await refresh();
      }
    };

    void runInitialRefresh();

    let debounceTimer: number | undefined;
    const debouncedRefresh = () => {
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = undefined;
        void refresh();
      }, 1500);
    };

    let timer: number | undefined;
    let healTimer: number | undefined;

    const startPolling = () => {
      if (timer !== undefined) return;
      const useVisibilityPolling = notificationPollingUsesVisibilityChange();
      if (!bellPollingAllowed(useVisibilityPolling)) return;
      timer = window.setInterval(() => { void refresh(); }, pollIntervalMs);
    };

    const stopPolling = () => {
      if (timer !== undefined) { window.clearInterval(timer); timer = undefined; }
    };

    const useVisibilityPolling = notificationPollingUsesVisibilityChange();

    const resumePollingIfAllowed = () => {
      stopPolling();
      startPolling();
    };

    const handleConnectivityResume = (options?: { forceNetwork?: boolean }) => {
      void refresh(options);
      resumePollingIfAllowed();
    };

    const handleSyncFlushComplete = (event: Event) => {
      if (!isMobileNativePlatform()) return;
      const detail = (event as CustomEvent<{ pendingRemaining?: number }>).detail;
      if (detail?.pendingRemaining !== 0) return;
      handleConnectivityResume({ forceNetwork: true });
    };

    const reconcilePolling = () => {
      const useVis = notificationPollingUsesVisibilityChange();
      if (shouldSkipBlockingFetch() || !bellPollingAllowed(useVis)) {
        stopPolling();
        return;
      }
      if (timer === undefined) startPolling();
    };

    reconcilePolling();

    const handleRefreshTrigger = () => { debouncedRefresh(); };

    const handleOnline = () => {
      handleConnectivityResume({ forceNetwork: true });
    };

    const handleVisibilityChange = () => {
      if (!useVisibilityPolling) return;
      if (document.visibilityState === "visible") {
        handleConnectivityResume({ forceNetwork: true });
      } else {
        stopPolling();
        void refresh();
      }
    };

    const handleOfflineModeOnline = () => {
      handleConnectivityResume({ forceNetwork: true });
    };

    const handleAppForeground = () => {
      handleConnectivityResume({ forceNetwork: true });
    };

    healTimer = window.setInterval(reconcilePolling, POLL_HEAL_MS);

    const handleApiServerReachable = () => {
      handleConnectivityResume({ forceNetwork: true });
    };

    window.addEventListener("focus", handleRefreshTrigger);
    window.addEventListener("online", handleOnline);
    window.addEventListener("auth-change", handleRefreshTrigger);
    window.addEventListener("auth-user-updated", handleRefreshTrigger);
    window.addEventListener("notifications:refresh", handleRefreshTrigger);
    window.addEventListener("offline-mode-online", handleOfflineModeOnline);
    window.addEventListener("api-server-reachable", handleApiServerReachable);
    window.addEventListener("sync-engine:flush-complete", handleSyncFlushComplete);
    if (useVisibilityPolling) {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    if (isMobileNativePlatform()) {
      window.addEventListener("app-foregrounded", handleAppForeground);
    }

    return () => {
      cancelled = true;
      stopPolling();
      if (healTimer !== undefined) window.clearInterval(healTimer);
      if (isMobileNativePlatform()) {
        window.removeEventListener("app-foregrounded", handleAppForeground);
      }
      if (useVisibilityPolling) {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
      window.removeEventListener("focus", handleRefreshTrigger);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("auth-change", handleRefreshTrigger);
      window.removeEventListener("auth-user-updated", handleRefreshTrigger);
      window.removeEventListener("notifications:refresh", handleRefreshTrigger);
      window.removeEventListener("offline-mode-online", handleOfflineModeOnline);
      window.removeEventListener("api-server-reachable", handleApiServerReachable);
      window.removeEventListener("sync-engine:flush-complete", handleSyncFlushComplete);
    };
  }, [refresh, pollIntervalMs]);

  useEffect(() => {
    if (!bannerNotification) return;
    const timer = window.setTimeout(() => setBannerNotification(null), 6000);
    return () => window.clearTimeout(timer);
  }, [bannerNotification]);

  const acknowledge = async (notificationIds?: string[]) => {
    await notificationService.acknowledge(notificationIds);
    if (!notificationIds?.length) {
      setBannerNotification(null);
    } else if (bannerNotification && notificationIds.includes(bannerNotification.id)) {
      setBannerNotification(null);
    }
    await refresh();
  };

  const value = useMemo<NotificationInboxContextValue>(() => ({
    notifications,
    unreadNotifications: notifications.filter((n) => !n.isRead),
    bannerNotification,
    loading,
    fromCache,
    acknowledge,
    dismissBanner: () => setBannerNotification(null),
    refresh,
  }), [notifications, bannerNotification, loading, fromCache, refresh]);

  return (
    <NotificationInboxContext.Provider value={value}>
      {children}
    </NotificationInboxContext.Provider>
  );
}

export function useNotificationInbox() {
  const context = useContext(NotificationInboxContext);
  if (!context) {
    throw new Error("useNotificationInbox must be used within NotificationInboxProvider");
  }
  return context;
}
