import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { notificationService } from "../services/notificationService";
import { shouldSkipBlockingFetch } from "../services/connectivityMonitor";
import { useAuth } from "../hooks/useAuth";
import { isDashboardRoute } from "../utils/postLoginRoute";
import type { AppNotification } from "../types/notification";
import { isMobileNativePlatform } from "../utils/platform";
import { notificationPollingUsesVisibilityChange } from "../utils/notificationInboxPolling";

const DASHBOARD_POLL_MS = 15_000;
const BACKGROUND_POLL_MS = 60_000;

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
  /** Native-only: tracks Capacitor app foreground — survives poll-interval effect re-runs. */
  const nativeAppActiveRef = useRef(true);

  const refresh = useCallback(async () => {
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

    const offlineRead = shouldSkipBlockingFetch();
    if (!offlineRead) setLoading(true);
    try {
      const next = await notificationService.list(true, 50);
      setNotifications(next);
      setFromCache(offlineRead);

      const unreadItems = next.filter((n) => !n.isRead);
      const unreadIds = new Set(unreadItems.map((n) => n.id));
      if (!initializedRef.current) {
        initializedRef.current = true;
        seenUnreadIdsRef.current = unreadIds;
        setBannerNotification(unreadItems[0] ?? null);

        // Cold-load recovery: if the dashboard's first workspace fetch lost the race
        // against a slow backend path, replay the existing unread assignment/run-state
        // signals once so listeners can recover without waiting for a brand-new
        // notification or a manual asset reassignment.
        const hasUnreadAssignmentEvent = unreadItems.some((n) => ASSIGNMENT_EVENT_TYPES.has(n.eventType));
        const hasUnreadRunStateEvent = unreadItems.some((n) => RUN_STATE_EVENT_TYPES.has(n.eventType));
        // Recovery signals re-fetch dashboard-workspace — only replay on Dashboard route.
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
    void refresh();

    // PERF: the notification poll (list includeRead=true take=50 -> ~27kB, doubled by
    // a CORS preflight on cross-origin dev) was firing far more than once per 15s,
    // because sync activity dispatches "notifications:refresh" repeatedly (useSyncEngine,
    // signatureService) and every dispatch triggered an immediate full fetch. On a busy
    // screen that produced a storm of large requests competing for the connection pool.
    //
    // Event-driven triggers are debounced so a burst collapses into a single fetch.
    // Polling pause/resume uses ONE lifecycle source per platform (mirrors
    // connectivityMonitor): visibilitychange on web, Capacitor appState on native.
    // Mixing both on native freezes the bell when camera/picker hides the document.
    let debounceTimer: number | undefined;
    const debouncedRefresh = () => {
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = undefined;
        void refresh();
      }, 1500);
    };

    let timer: number | undefined;
    const startPolling = () => {
      if (timer !== undefined || shouldSkipBlockingFetch()) return;
      timer = window.setInterval(() => { void refresh(); }, pollIntervalMs);
    };
    const stopPolling = () => {
      if (timer !== undefined) { window.clearInterval(timer); timer = undefined; }
    };

    const useVisibilityPolling = notificationPollingUsesVisibilityChange();

    const resumePollingIfAllowed = () => {
      if (shouldSkipBlockingFetch()) return;
      stopPolling();
      startPolling();
    };

    // Start interval when online. Web waits for a visible tab; native trusts app foreground.
    if (!shouldSkipBlockingFetch()) {
      const shouldStart =
        useVisibilityPolling
          ? document.visibilityState === "visible"
          : nativeAppActiveRef.current;
      if (shouldStart) startPolling();
    }

    const handleRefreshTrigger = () => { debouncedRefresh(); };
    const handleVisibilityChange = () => {
      if (!useVisibilityPolling) return;
      if (document.visibilityState === "visible") {
        if (!shouldSkipBlockingFetch()) {
          void refresh();
          resumePollingIfAllowed();
        }
      } else {
        stopPolling();
      }
    };
    const handleOfflineModeOnline = () => {
      void refresh();
      if (useVisibilityPolling) {
        if (document.visibilityState === "visible") resumePollingIfAllowed();
      } else if (nativeAppActiveRef.current) {
        resumePollingIfAllowed();
      }
    };
    const handleOfflineModeOffline = () => {
      stopPolling();
      void refresh();
    };
    const handleAppBackground = () => {
      nativeAppActiveRef.current = false;
      stopPolling();
    };
    const handleAppForeground = () => {
      nativeAppActiveRef.current = true;
      void refresh();
      resumePollingIfAllowed();
    };

    window.addEventListener("focus", handleRefreshTrigger);
    window.addEventListener("online", handleRefreshTrigger);
    window.addEventListener("auth-change", handleRefreshTrigger);
    window.addEventListener("auth-user-updated", handleRefreshTrigger);
    window.addEventListener("notifications:refresh", handleRefreshTrigger);
    window.addEventListener("offline-mode-online", handleOfflineModeOnline);
    window.addEventListener("offline", handleOfflineModeOffline);
    if (useVisibilityPolling) {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    if (isMobileNativePlatform()) {
      window.addEventListener("app-backgrounded", handleAppBackground);
      window.addEventListener("app-foregrounded", handleAppForeground);
    }

    return () => {
      stopPolling();
      if (isMobileNativePlatform()) {
        window.removeEventListener("app-backgrounded", handleAppBackground);
        window.removeEventListener("app-foregrounded", handleAppForeground);
      }
      if (useVisibilityPolling) {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
      window.removeEventListener("focus", handleRefreshTrigger);
      window.removeEventListener("online", handleRefreshTrigger);
      window.removeEventListener("auth-change", handleRefreshTrigger);
      window.removeEventListener("auth-user-updated", handleRefreshTrigger);
      window.removeEventListener("notifications:refresh", handleRefreshTrigger);
      window.removeEventListener("offline-mode-online", handleOfflineModeOnline);
      window.removeEventListener("offline", handleOfflineModeOffline);
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
