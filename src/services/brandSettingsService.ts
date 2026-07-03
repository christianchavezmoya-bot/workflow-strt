import api from "./api";
import { isMobileNativePlatform } from "../utils/platform";
import { referenceDataGet, referenceDataSet } from "./localDB";

export interface BrandSetting {
  logoBase64?: string | null;
  appName?: string | null;
}

const BRAND_REF_KEY = "brand_settings";

export const brandSettingsService = {
  async get(): Promise<BrandSetting> {
    try {
      const res = await api.get<BrandSetting>("/brand-settings");
      // Cache the logo so offline PDF reports render with branding.
      if (isMobileNativePlatform()) {
        await referenceDataSet(BRAND_REF_KEY, res.data);
      }
      return res.data;
    } catch {
      if (isMobileNativePlatform()) {
        const cached = await referenceDataGet<BrandSetting>(BRAND_REF_KEY);
        if (cached) return cached;
      }
      return {};
    }
  },

  async set(logoBase64: string): Promise<BrandSetting> {
    const res = await api.put<BrandSetting>("/brand-settings", { logoBase64 });
    if (isMobileNativePlatform()) await referenceDataSet(BRAND_REF_KEY, res.data);
    return res.data;
  },

  async setAppName(appName: string): Promise<BrandSetting> {
    const res = await api.put<BrandSetting>("/brand-settings", { appName });
    if (isMobileNativePlatform()) await referenceDataSet(BRAND_REF_KEY, res.data);
    return res.data;
  },

  async remove(): Promise<void> {
    await api.delete("/brand-settings");
  },
};
