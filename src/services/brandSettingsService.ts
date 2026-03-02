import api from "./api";

export interface BrandSetting {
  logoBase64?: string | null;
}

export const brandSettingsService = {
  async get(): Promise<BrandSetting> {
    try {
      const res = await api.get<BrandSetting>("/brand-settings");
      return res.data;
    } catch {
      return {};
    }
  },

  async set(logoBase64: string): Promise<BrandSetting> {
    const res = await api.put<BrandSetting>("/brand-settings", { logoBase64 });
    return res.data;
  },

  async remove(): Promise<void> {
    await api.delete("/brand-settings");
  },
};
