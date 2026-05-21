import api from "./api";

export interface BrandSetting {
  logoBase64?: string | null;
  appName?: string | null;
}

let cachedBrandSettings: BrandSetting | null = null;
let brandSettingsRequest: Promise<BrandSetting> | null = null;

export const brandSettingsService = {
  async get(): Promise<BrandSetting> {
    if (cachedBrandSettings) {
      return cachedBrandSettings;
    }

    if (brandSettingsRequest) {
      return brandSettingsRequest;
    }

    brandSettingsRequest = api.get<BrandSetting>("/brand-settings")
      .then((res) => {
        cachedBrandSettings = res.data ?? {};
        return cachedBrandSettings;
      })
      .catch(() => ({}))
      .finally(() => {
        brandSettingsRequest = null;
      });

    return brandSettingsRequest;
  },

  async set(logoBase64: string): Promise<BrandSetting> {
    const res = await api.put<BrandSetting>("/brand-settings", { logoBase64 });
    cachedBrandSettings = res.data ?? {};
    return res.data;
  },

  async setAppName(appName: string): Promise<BrandSetting> {
    const res = await api.put<BrandSetting>("/brand-settings", { appName });
    cachedBrandSettings = res.data ?? {};
    return res.data;
  },

  async remove(): Promise<void> {
    await api.delete("/brand-settings");
    cachedBrandSettings = cachedBrandSettings ? { ...cachedBrandSettings, logoBase64: null } : { logoBase64: null };
  },
};
