import api from "./api";
import { isMobileNativePlatform } from "../utils/platform";
import { referenceDataGet, referenceDataSet } from "./localDB";

export interface BrandSetting {
  logoBase64?: string | null;
  appName?: string | null;
}

const BRAND_REF_KEY = "brand_settings";
let brandSettingsCache: BrandSetting | null = null;
let brandSettingsPromise: Promise<BrandSetting> | null = null;

export const brandSettingsService = {
  async get(): Promise<BrandSetting> {
    if (brandSettingsCache) return brandSettingsCache;
    if (brandSettingsPromise) return brandSettingsPromise;

    brandSettingsPromise = (async () => {
      try {
        const res = await api.get<BrandSetting>("/brand-settings");
        brandSettingsCache = res.data;
        // Cache the logo so offline PDF reports render with branding.
        if (isMobileNativePlatform()) {
          await referenceDataSet(BRAND_REF_KEY, res.data);
        }
        return res.data;
      } catch {
        if (brandSettingsCache) return brandSettingsCache;
        if (isMobileNativePlatform()) {
          const cached = await referenceDataGet<BrandSetting>(BRAND_REF_KEY);
          if (cached) {
            brandSettingsCache = cached;
            return cached;
          }
        }
        return {};
      } finally {
        brandSettingsPromise = null;
      }
    })();

    return brandSettingsPromise;
  },

  async set(logoBase64: string): Promise<BrandSetting> {
    const res = await api.put<BrandSetting>("/brand-settings", { logoBase64 });
    brandSettingsCache = res.data;
    brandSettingsPromise = null;
    if (isMobileNativePlatform()) await referenceDataSet(BRAND_REF_KEY, res.data);
    return res.data;
  },

  async setAppName(appName: string): Promise<BrandSetting> {
    const res = await api.put<BrandSetting>("/brand-settings", { appName });
    brandSettingsCache = res.data;
    brandSettingsPromise = null;
    if (isMobileNativePlatform()) await referenceDataSet(BRAND_REF_KEY, res.data);
    return res.data;
  },

  async remove(): Promise<void> {
    await api.delete("/brand-settings");
    brandSettingsCache = null;
    brandSettingsPromise = null;
  },
};
