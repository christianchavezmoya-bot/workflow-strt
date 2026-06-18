import api from "./api";
import { cacheGet, cachePut } from "./localDB";
import { isMobileNativePlatform } from "../utils/platform";

export interface FeatureSelection {
  featureId: string;
  included: boolean;
  activeCount: number;
}

export interface ProductConfig {
  id: string;
  name: string;
  productId: string;
  status: string;
  featureSelections: FeatureSelection[];
  notes?: string;
  workflowTemplateId?: string;
  configType?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertProductConfigInput {
  name: string;
  productId: string;
  status: string;
  featureSelections: FeatureSelection[];
  notes?: string;
  workflowTemplateId?: string;
  configType?: string;
}

const LS_KEY = (productId: string) => `product_configs_v1_${productId}`;

function lsRead(productId: string): ProductConfig[] {
  try {
    const raw = localStorage.getItem(LS_KEY(productId));
    if (raw) return JSON.parse(raw) as ProductConfig[];
  } catch {}
  return [];
}

function lsWrite(productId: string, configs: ProductConfig[]) {
  try { localStorage.setItem(LS_KEY(productId), JSON.stringify(configs)); } catch {}
}

export const productConfigService = {
  async listByProduct(productId: string): Promise<ProductConfig[]> {
    if (!isMobileNativePlatform()) {
      const res = await api.get<ProductConfig[]>(`/wi-templates/by-product/${productId}`);
      return res.data;
    }

    const cacheKey = `product_configs_v2_${productId}`;
    const cached = await cacheGet<ProductConfig[]>(cacheKey);

    // Background refresh — always runs, keeps cache warm for next time
    api.get<ProductConfig[]>(`/wi-templates/by-product/${productId}`)
      .then((res) => {
        cachePut(cacheKey, res.data).catch(() => {});
        lsWrite(productId, res.data); // keep legacy fallback in sync too
      })
      .catch(() => {});

    if (cached !== null) return cached;

    // No cache yet — wait for network (first-ever load for this product)
    try {
      const res = await api.get<ProductConfig[]>(`/wi-templates/by-product/${productId}`);
      await cachePut(cacheKey, res.data);
      lsWrite(productId, res.data);
      return res.data;
    } catch (err: unknown) {
      console.warn("[productConfigService] API unavailable, falling back to localStorage", err);
      return lsRead(productId);
    }
  },

  async create(input: UpsertProductConfigInput): Promise<ProductConfig> {
    const res = await api.post<ProductConfig>("/wi-templates", {
      name: input.name,
      productId: input.productId,
      status: input.status,
      featureSelections: input.featureSelections,
      notes: input.notes ?? null,
      workflowTemplateId: input.workflowTemplateId ?? null,
      configType: input.configType ?? null,
    });
    const configs = lsRead(input.productId);
    configs.unshift(res.data);
    lsWrite(input.productId, configs);
    return res.data;
  },

  async update(id: string, patch: Partial<UpsertProductConfigInput>): Promise<ProductConfig> {
    const res = await api.put<ProductConfig>(`/wi-templates/${id}`, patch);
    const productId = res.data.productId;
    const configs = lsRead(productId).map((c) => (c.id === id ? res.data : c));
    lsWrite(productId, configs);
    return res.data;
  },

  async remove(id: string, productId: string): Promise<void> {
    await api.delete(`/wi-templates/${id}`);
    const configs = lsRead(productId).filter((c) => c.id !== id);
    lsWrite(productId, configs);
  },
};
