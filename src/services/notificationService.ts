import api from "./api";
import type { AppNotification, CreateNotificationInput } from "../types/notification";

export const notificationService = {
  async list(includeRead = true, take = 50): Promise<AppNotification[]> {
    const response = await api.get<AppNotification[]>("/notifications", {
      params: { includeRead, take },
    });
    return response.data;
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
