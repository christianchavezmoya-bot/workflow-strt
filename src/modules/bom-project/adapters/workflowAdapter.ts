import api from "../../../services/api";

export interface TemplateSuggestion {
  templateId: string;
  templateName: string;
  matchScore: number;
}

export const workflowAdapter = {
  async suggestTemplate(configType?: string, productId?: string): Promise<TemplateSuggestion | null> {
    try {
      const { data } = await api.get<Array<{ id: string; name?: string }>>("/workflow-configs", {
        params: { status: "Published", productId, configType },
      });
      if (!data.length) return null;
      return { templateId: data[0].id, templateName: data[0].name ?? "", matchScore: 1 };
    } catch {
      return null;
    }
  },

  async createWorkflowAssignment(assetId: string, workflowConfigId: string): Promise<void> {
    await api.post("/asset-workflow-assignments", { assetId, workflowConfigId });
  },
};
