import api from "./api";
import { QuickbaseSettingsPayload } from "../types/settings";

export const settingsService = {
  async saveQuickbaseSettings(payload: QuickbaseSettingsPayload) {
    const response = await api.post<QuickbaseSettingsPayload>("/settings/quickbase", payload);
    return response.data;
  }
};
