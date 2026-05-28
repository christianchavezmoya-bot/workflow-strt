import api from "./api";
import { NotificationSettingsPayload, PublicAppSettingsPayload, QuickbaseSettingsPayload } from "../types/settings";

let publicAppSettingsPromise: Promise<PublicAppSettingsPayload> | null = null;

export const settingsService = {
  async getQuickbaseSettings() {
    const response = await api.get<QuickbaseSettingsPayload>("/settings/quickbase");
    return response.data;
  },

  async saveQuickbaseSettings(payload: QuickbaseSettingsPayload) {
    const response = await api.post<QuickbaseSettingsPayload>("/settings/quickbase", payload);
    return response.data;
  },

  async getNotificationSettings() {
    const response = await api.get<NotificationSettingsPayload>("/settings/notifications");
    return response.data;
  },

  async saveNotificationSettings(payload: NotificationSettingsPayload) {
    const response = await api.post<NotificationSettingsPayload>("/settings/notifications", payload);
    return response.data;
  },

  async getPublicAppSettings(forceRefresh = false) {
    if (!forceRefresh && publicAppSettingsPromise) {
      return publicAppSettingsPromise;
    }

    publicAppSettingsPromise = api
      .get<PublicAppSettingsPayload>("/settings/public")
      .then((response) => response.data)
      .catch((error) => {
        publicAppSettingsPromise = null;
        throw error;
      });

    return publicAppSettingsPromise;
  }
};

