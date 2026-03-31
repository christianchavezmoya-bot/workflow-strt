import api from "./api";
import type { Workflow } from "../types/workflow";

export interface WorkflowTemplateDto {
  id: string;
  name: string;
  productId: string;
  stepsJson: string;
  mediaJson: string;
  createdAt: string;
  updatedAt: string;
}

function toWorkflow(dto: WorkflowTemplateDto): Workflow {
  let steps = [];
  let media = [];
  try { steps = JSON.parse(dto.stepsJson) || []; } catch {}
  try { media = JSON.parse(dto.mediaJson) || []; } catch {}
  return {
    id: dto.id,
    name: dto.name,
    productId: dto.productId,
    createdAt: new Date(dto.createdAt).getTime(),
    steps,
    media,
  };
}

export const workflowTemplateService = {
  async getByProduct(productId: string): Promise<Workflow[]> {
    const res = await api.get<WorkflowTemplateDto[]>(`/workflow-templates/by-product/${productId}`);
    return res.data.map(toWorkflow);
  },

  async getById(id: string): Promise<Workflow | null> {
    try {
      const res = await api.get<WorkflowTemplateDto>(`/workflow-templates/${id}`);
      return toWorkflow(res.data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) return null;
      throw err;
    }
  },

  async getFirstByProduct(productId: string): Promise<Workflow | null> {
    try {
      const res = await api.get<WorkflowTemplateDto[]>(`/workflow-templates/by-product/${productId}`);
      if (res.data.length === 0) return null;
      return toWorkflow(res.data[0]);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) return null;
      throw err;
    }
  },

  async create(workflow: Workflow): Promise<WorkflowTemplateDto> {
    const res = await api.post<WorkflowTemplateDto>("/workflow-templates", {
      name: workflow.name,
      productId: workflow.productId,
      stepsJson: JSON.stringify(workflow.steps),
      mediaJson: JSON.stringify(workflow.media ?? []),
    });
    return res.data;
  },

  async update(id: string, workflow: Workflow): Promise<WorkflowTemplateDto> {
    const res = await api.put<WorkflowTemplateDto>(`/workflow-templates/${id}`, {
      name: workflow.name,
      productId: workflow.productId,
      stepsJson: JSON.stringify(workflow.steps),
      mediaJson: JSON.stringify(workflow.media ?? []),
    });
    return res.data;
  },

  async upsert(templateId: string | null, workflow: Workflow): Promise<string> {
    if (templateId) {
      const dto = await this.update(templateId, workflow);
      return dto.id;
    }
    const dto = await this.create(workflow);
    return dto.id;
  },

  async uploadMedia(templateId: string, file: File): Promise<Workflow> {
    const form = new FormData();
    form.append("file", file);
    const res = await api.post<WorkflowTemplateDto>(`/workflow-templates/${templateId}/media`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return toWorkflow(res.data);
  },

  async deleteMedia(templateId: string, mediaId: string): Promise<Workflow> {
    const res = await api.delete<WorkflowTemplateDto>(`/workflow-templates/${templateId}/media/${mediaId}`);
    return toWorkflow(res.data);
  },
};
