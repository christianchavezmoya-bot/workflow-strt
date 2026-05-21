import api from "./api";

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

export const productConfigService = {
  async listByProduct(productId: string): Promise<ProductConfig[]> {
    const res = await api.get<ProductConfig[]>(`/wi-templates/by-product/${productId}`);
    return res.data;
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
    return res.data;
  },

  async update(id: string, patch: Partial<UpsertProductConfigInput>): Promise<ProductConfig> {
    const res = await api.put<ProductConfig>(`/wi-templates/${id}`, patch);
    return res.data;
  },

  async remove(id: string, _productId: string): Promise<void> {
    await api.delete(`/wi-templates/${id}`);
  },
};
