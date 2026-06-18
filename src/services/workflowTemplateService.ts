import api from "./api";
import type { Workflow } from "../types/workflow";
import offlineStore from "./offlineStore";
import { isMobileNativePlatform } from "../utils/platform";
import { webCachedGet, invalidateWebCacheByPrefix } from "./webFreshCache";

// Shape returned by the backend
export interface WorkflowTemplateDto {
  id: string;
  name: string;
  productId: string;
  workflowTypeId?: string;
  stepsJson: string;
  mediaJson: string;
  createdAt: string;
  updatedAt: string;
}

const LS_KEY = (productId: string) => `wf_builder_v2_${productId}`;
const LS_LIST_KEY = (productId: string) => `wf_list_v1_${productId}`;
const CACHE_PRODUCT_KEY = (productId: string) => `workflow-templates:product:${productId}`;
const CACHE_ID_KEY = (id: string) => `workflow-templates:id:${id}`;

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
    workflowTypeId: dto.workflowTypeId,
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

async function cacheWorkflow(workflow: Workflow): Promise<void> {
  await offlineStore.saveCache(CACHE_ID_KEY(workflow.id), workflow);
}

async function cacheWorkflows(productId: string, workflows: Workflow[]): Promise<void> {
  await offlineStore.saveCache(CACHE_PRODUCT_KEY(productId), workflows);
  await Promise.all(workflows.map((workflow) => cacheWorkflow(workflow)));
}

export const workflowTemplateService = {
  /**
   * Loads all workflow templates for a product (returns array).
   * Priority: API → localStorage fallback.
   */
  async getByProduct(productId: string): Promise<Workflow[]> {
    if (!isMobileNativePlatform()) {
      return webCachedGet(`/workflow-templates/by-product/${productId}`, async () => {
        const res = await api.get<WorkflowTemplateDto[]>(`/workflow-templates/by-product/${productId}`);
        return res.data.map(toWorkflow);
      });
    }

    try {
      const res = await api.get<WorkflowTemplateDto[]>(`/workflow-templates/by-product/${productId}`);
      const workflows = res.data.map(toWorkflow);
      try { localStorage.setItem(LS_LIST_KEY(productId), JSON.stringify(res.data)); } catch {}
      // Keep LS cache for the most-recently-updated template for backward compat
      if (workflows.length > 0) lsWrite(workflows[0]);
      await cacheWorkflows(productId, workflows);
      return workflows;
    } catch (err: unknown) {
      console.warn("[workflowTemplateService] API unavailable, falling back to localStorage", err);
      const cached = await offlineStore.getCache<Workflow[]>(CACHE_PRODUCT_KEY(productId));
      if (cached && cached.length > 0) return cached;
      try {
        const raw = localStorage.getItem(LS_LIST_KEY(productId));
        if (raw) return (JSON.parse(raw) as WorkflowTemplateDto[]).map(toWorkflow);
      } catch {}
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
    if (!isMobileNativePlatform()) {
      try {
        return await webCachedGet(`/workflow-templates/${id}`, async () => {
          const res = await api.get<WorkflowTemplateDto>(`/workflow-templates/${id}`);
          return toWorkflow(res.data);
        });
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) return null;
        throw err;
      }
    }

    try {
      const res = await api.get<WorkflowTemplateDto>(`/workflow-templates/${id}`);
      const wf = toWorkflow(res.data);
      lsWrite(wf);
      await cacheWorkflow(wf);
      return wf;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) return null;
      const cached = await offlineStore.getCache<Workflow>(CACHE_ID_KEY(id));
      if (cached) return cached;
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
    if (!isMobileNativePlatform()) {
      const all = await webCachedGet(`/workflow-templates/by-product/${productId}`, async () => {
        const res = await api.get<WorkflowTemplateDto[]>(`/workflow-templates/by-product/${productId}`);
        return res.data.map(toWorkflow);
      });
      return all.length === 0 ? null : all[0];
    }

    try {
      const res = await api.get<WorkflowTemplateDto[]>(`/workflow-templates/by-product/${productId}`);
      if (res.data.length === 0) return null;
      const wf = toWorkflow(res.data[0]);
      lsWrite(wf);
      await cacheWorkflows(productId, res.data.map(toWorkflow));
      return wf;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) return null;
      const cached = await offlineStore.getCache<Workflow[]>(CACHE_PRODUCT_KEY(productId));
      if (cached && cached.length > 0) return cached[0] ?? null;
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
      workflowTypeId: workflow.workflowTypeId,
      stepsJson: JSON.stringify(workflow.steps),
      mediaJson: JSON.stringify(workflow.media ?? []),
    });
    lsWrite(toWorkflow(res.data));
    invalidateWebCacheByPrefix("/workflow-templates");
    return res.data;
  },

  /**
   * Updates an existing workflow template.
   */
  async update(id: string, workflow: Workflow): Promise<WorkflowTemplateDto> {
    const res = await api.put<WorkflowTemplateDto>(`/workflow-templates/${id}`, {
      name: workflow.name,
      productId: workflow.productId,
      workflowTypeId: workflow.workflowTypeId,
      stepsJson: JSON.stringify(workflow.steps),
      mediaJson: JSON.stringify(workflow.media ?? []),
    });
    lsWrite(toWorkflow(res.data));
    invalidateWebCacheByPrefix("/workflow-templates");
    return res.data;
  },

  /**
   * Upsert: creates if no templateId, updates if one exists.
   * Returns the remote template ID (for subsequent updates).
   */
  async upsert(templateId: string | null, workflow: Workflow): Promise<string> {
    try {
      if (isMobileNativePlatform()) {
        lsWrite(workflow); // always write locally first as optimistic cache
      }
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
    invalidateWebCacheByPrefix("/workflow-templates");
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
    invalidateWebCacheByPrefix("/workflow-templates");
    return wf;
  },

  /** Remove the LS cache for a product (e.g. after deletion). */
  clearCache(productId: string) {
    if (!isMobileNativePlatform()) return;
    try { localStorage.removeItem(LS_KEY(productId)); } catch {}
  },
};
