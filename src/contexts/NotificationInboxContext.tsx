import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { notificationService } from "../services/notificationService";
import { useAuth } from "../hooks/useAuth";
import type { AppNotification } from "../types/notification";

const ASSIGNMENT_EVENT_TYPES = new Set([
  "workflow-assigned", "workflow-assigned-to-installer", "workflow-self-assigned",
  "workflow-unassigned", "asset-created", "asset-assignment-updated",
  "asset-assigned", "asset-unassigned", "asset-takeover", "asset-self-assigned",
]);

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
  acknowledge: (notificationIds?: string[]) => Promise<void>;
  dismissBanner: () => void;
  refresh: () => Promise<void>;
};

const NotificationInboxContext = createContext<NotificationInboxContextValue | undefined>(undefined);

export function NotificationInboxProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [bannerNotification, setBannerNotification] = useState<AppNotification | null>(null);
  const seenUnreadIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const refresh = useCallback(async () => {
    const path = window.location.pathname;
    const isPublicRoute =
      path === "/login" ||
      path === "/reset-password" ||
      path.startsWith("/sign/") ||
      path === "/mobile-upload";

    if (!isAuthenticated || !user?.id || isPublicRoute) {
      setNotifications([]);
      setBannerNotification(null);
      initializedRef.current = false;
      seenUnreadIdsRef.current = new Set();
      return;
    }

    setLoading(true);
    try {
      const next = await notificationService.list(true, 50);
      setNotifications(next);

      const unreadIds = new Set(next.filter((n) => !n.isRead).map((n) => n.id));
      if (!initializedRef.current) {
        initializedRef.current = true;
        seenUnreadIdsRef.current = unreadIds;
        setBannerNotification(next.find((n) => !n.isRead) ?? null);
        return;
      }

      const newestUnread = next.find((n) => !n.isRead && !seenUnreadIdsRef.current.has(n.id));
      seenUnreadIdsRef.current = unreadIds;
      if (newestUnread) {
        setBannerNotification(newestUnread);
        if (ASSIGNMENT_EVENT_TYPES.has(newestUnread.eventType)) {
          window.dispatchEvent(new Event("notifications:assignments-changed"));
        }
        if (RUN_STATE_EVENT_TYPES.has(newestUnread.eventType)) {
          window.dispatchEvent(new Event("notifications:run-state-changed"));
        }
      }
    } catch (error) {
      console.error("Notification inbox refresh failed:", error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    void refresh();

    // PERF: the notification poll (list includeRead=true take=50 → ~27kB, doubled by
    // a CORS preflight on cross-origin dev) was firing far more than once per 15s,
    // because sync activity dispatches "notifications:refresh" repeatedly (useSyncEngine,
    // signatureService) and every dispatch triggered an immediate full fetch. On a busy
    // screen that produced a storm of large requests competing for the connection pool.
    //
    // Two changes:
    //   1) Debounce the EVENT-driven triggers so a burst collapses into a single fetch.
    //   2) Pause the 15s interval while the tab is hidden; refresh once on becoming visible.
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
      if (timer !== undefined) return;
      timer = window.setInterval(() => { void refresh(); }, 15000);
    };
    const stopPolling = () => {
      if (timer !== undefined) { window.clearInterval(timer); timer = undefined; }
    };
    // Only poll while the tab is visible — a backgrounded tab doesn't need to keep
    // hitting the server every 15s.
    if (document.visibilityState === "visible") startPolling();

    const handleRefreshTrigger = () => { debouncedRefresh(); };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();     // catch up immediately on return
        startPolling();
      } else {
        stopPolling();
      }
    };

    window.addEventListener("focus", handleRefreshTrigger);
    window.addEventListener("online", handleRefreshTrigger);
    window.addEventListener("auth-change", handleRefreshTrigger);
    window.addEventListener("auth-user-updated", handleRefreshTrigger);
    window.addEventListener("notifications:refresh", handleRefreshTrigger);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
      window.removeEventListener("focus", handleRefreshTrigger);
      window.removeEventListener("online", handleRefreshTrigger);
      window.removeEventListener("auth-change", handleRefreshTrigger);
      window.removeEventListener("auth-user-updated", handleRefreshTrigger);
      window.removeEventListener("notifications:refresh", handleRefreshTrigger);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

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
    acknowledge,
    dismissBanner: () => setBannerNotification(null),
    refresh,
  }), [notifications, bannerNotification, loading, refresh]);

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
