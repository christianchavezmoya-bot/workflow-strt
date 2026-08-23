import api from "./api";
import { cacheGet, cachePut } from "./localDB";
import type { AppNotification, CreateNotificationInput } from "../types/notification";
import { shouldSkipBlockingFetch } from "./connectivityMonitor";
import { isMobileNativePlatform } from "../utils/platform";

const NOTIFICATIONS_CACHE_KEY = "notifications_v1";

export const notificationService = {
  async list(
    includeRead = true,
    take = 50,
    options?: { forceNetwork?: boolean },
  ): Promise<AppNotification[]> {
    const forceNetwork = options?.forceNetwork === true;

    if (!isMobileNativePlatform()) {
      const response = await api.get<AppNotification[]>("/notifications", {
        params: { includeRead, take },
      });
      return response.data;
    }

    const cached = await cacheGet<AppNotification[]>(NOTIFICATIONS_CACHE_KEY);
    const cachedList = Array.isArray(cached) ? cached : null;

    if (forceNetwork || !shouldSkipBlockingFetch()) {
      try {
        const response = await api.get<AppNotification[]>("/notifications", {
          params: { includeRead, take },
        });
        await cachePut(NOTIFICATIONS_CACHE_KEY, response.data);
        return response.data;
      } catch {
        return cachedList ?? [];
      }
    }

    return cachedList ?? [];
  },

  async acknowledge(notificationIds?: string[]): Promise<void> {
    await api.post("/notifications/acknowledge", {
      notificationIds: notificationIds && notificationIds.length > 0 ? notificationIds : null,
    });
  },

  async create(input: CreateNotificationInput): Promise<void> {
    await api.post("/notifications", {
      ...input,
      recipientUserIds: input.recipientUserIds?.length ? input.recipientUserIds : null,
      recipientRoles: input.recipientRoles?.length ? input.recipientRoles : null,
    });
  },
};
