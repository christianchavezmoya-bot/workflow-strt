import api from "./api";
import type { Workflow } from "../types/workflow";

// Shape returned by the backend
export interface WorkflowTemplateDto {
  id: string;
  name: string;
  productId: string;
  stepsJson: string;
  mediaJson: string;
  createdAt: string;
  updatedAt: string;
}

const LS_KEY = (productId: string) => `wf_builder_v2_${productId}`;
const LS_LIST_KEY = (productId: string) => `wf_list_v1_${productId}`;

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

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

function lsRead(productId: string): Workflow | null {
  try {
    const raw = localStorage.getItem(LS_KEY(productId));
    if (raw) return JSON.parse(raw) as Workflow;
  } catch {}
  return null;
}

function lsWrite(wf: Workflow) {
  try {
    localStorage.setItem(LS_KEY(wf.productId), JSON.stringify(wf));
    // Also cache by template id so WorkflowBuilder can restore per-config
    if (wf.id) localStorage.setItem(`wf_builder_v2_${wf.id}`, JSON.stringify(wf));
  } catch {}
}

// ------------------------------------------------------------------
// Service
// ------------------------------------------------------------------

export const workflowTemplateService = {
  /**
   * Loads all workflow templates for a product (returns array).
   * Priority: API → localStorage fallback.
   */
  async getByProduct(productId: string): Promise<Workflow[]> {
    try {
      const res = await api.get<WorkflowTemplateDto[]>(`/workflow-templates/by-product/${productId}`);
      const workflows = res.data.map(toWorkflow);
      try { localStorage.setItem(LS_LIST_KEY(productId), JSON.stringify(res.data)); } catch {}
      // Keep LS cache for the most-recently-updated template for backward compat
      if (workflows.length > 0) lsWrite(workflows[0]);
      return workflows;
    } catch (err: unknown) {
      console.warn("[workflowTemplateService] API unavailable, falling back to localStorage", err);
      try {
        const raw = localStorage.getItem(LS_LIST_KEY(productId));
        if (raw) return (JSON.parse(raw) as WorkflowTemplateDto[]).map(toWorkflow);
      } catch {}
      // Ultimate fallback: the single template cache
      const single = lsRead(productId);
      return single ? [single] : [];
    }
  },

  /**
   * Loads a single workflow template by id.
   * Priority: API → localStorage fallback.
   * Returns null if not found.
   */
  async getById(id: string): Promise<Workflow | null> {
    try {
      const res = await api.get<WorkflowTemplateDto>(`/workflow-templates/${id}`);
      const wf = toWorkflow(res.data);
      lsWrite(wf);
      return wf;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) return null;
      console.warn("[workflowTemplateService] API unavailable, falling back to localStorage for id", id, err);
      try {
        const raw = localStorage.getItem(`wf_builder_v2_${id}`);
        if (raw) return JSON.parse(raw) as Workflow;
      } catch {}
      return null;
    }
  },

  /**
   * Legacy: loads the first/only workflow template for a product.
   * Kept for backward compat with WorkflowBuilder default mode.
   */
  async getFirstByProduct(productId: string): Promise<Workflow | null> {
    try {
      const res = await api.get<WorkflowTemplateDto[]>(`/workflow-templates/by-product/${productId}`);
      if (res.data.length === 0) return null;
      const wf = toWorkflow(res.data[0]);
      lsWrite(wf);
      return wf;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) return null;
      console.warn("[workflowTemplateService] API unavailable, falling back to localStorage", err);
      return lsRead(productId);
    }
  },

  /**
   * Creates a new workflow template on the backend.
   */
  async create(workflow: Workflow): Promise<WorkflowTemplateDto> {
    const res = await api.post<WorkflowTemplateDto>("/workflow-templates", {
      name: workflow.name,
      productId: workflow.productId,
      stepsJson: JSON.stringify(workflow.steps),
      mediaJson: JSON.stringify(workflow.media ?? []),
    });
    lsWrite(toWorkflow(res.data));
    return res.data;
  },

  /**
   * Updates an existing workflow template.
   */
  async update(id: string, workflow: Workflow): Promise<WorkflowTemplateDto> {
    const res = await api.put<WorkflowTemplateDto>(`/workflow-templates/${id}`, {
      name: workflow.name,
      productId: workflow.productId,
      stepsJson: JSON.stringify(workflow.steps),
      mediaJson: JSON.stringify(workflow.media ?? []),
    });
    lsWrite(toWorkflow(res.data));
    return res.data;
  },

  /**
   * Upsert: creates if no templateId, updates if one exists.
   * Returns the remote template ID (for subsequent updates).
   */
  async upsert(templateId: string | null, workflow: Workflow): Promise<string> {
    try {
      lsWrite(workflow); // always write locally first as optimistic cache
      if (templateId) {
        const dto = await this.update(templateId, workflow);
        return dto.id;
      } else {
        const dto = await this.create(workflow);
        return dto.id;
      }
    } catch (err) {
      console.warn("[workflowTemplateService] Save failed, data preserved in localStorage", err);
      throw err; // re-throw so caller can show error state
    }
  },

  /**
   * Uploads a media file to the workflow template.
   * Returns the updated Workflow (with the new media item appended).
   */
  async uploadMedia(templateId: string, file: File): Promise<Workflow> {
    const form = new FormData();
    form.append("file", file);
    const res = await api.post<WorkflowTemplateDto>(`/workflow-templates/${templateId}/media`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const wf = toWorkflow(res.data);
    lsWrite(wf);
    return wf;
  },

  /**
   * Deletes a media item from the workflow template.
   * Returns the updated Workflow.
   */
  async deleteMedia(templateId: string, mediaId: string): Promise<Workflow> {
    const res = await api.delete<WorkflowTemplateDto>(`/workflow-templates/${templateId}/media/${mediaId}`);
    const wf = toWorkflow(res.data);
    lsWrite(wf);
    return wf;
  },

  /** Remove the LS cache for a product (e.g. after deletion). */
  clearCache(productId: string) {
    try { localStorage.removeItem(LS_KEY(productId)); } catch {}
  },
};
