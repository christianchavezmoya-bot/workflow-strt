import api from "./api";
import type { WorkflowType } from "../types/workflowType";

const LS_KEY = "workflow_types_v1";

function lsRead(): WorkflowType[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as WorkflowType[];
  } catch {}
  return [];
}

function lsWrite(types: WorkflowType[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(types)); } catch {}
}

export const workflowTypeService = {
  async list(): Promise<WorkflowType[]> {
    try {
      const res = await api.get<WorkflowType[]>("/workflow-types");
      lsWrite(res.data);
      return res.data;
    } catch (err: unknown) {
      console.warn("[workflowTypeService] API unavailable, falling back to localStorage", err);
      const cached = lsRead();
      if (cached.length) return cached;
      // fallback defaults
      return [
        { id: "wftype-installation",  name: "Installation",  sortOrder: 1, isActive: true },
        { id: "wftype-commissioning", name: "Commissioning", sortOrder: 2, isActive: true },
        { id: "wftype-inspection",    name: "Inspection",    sortOrder: 3, isActive: true },
        { id: "wftype-repair",        name: "Repair",        sortOrder: 4, isActive: true },
      ];
    }
  },

  async listAll(): Promise<WorkflowType[]> {
    const res = await api.get<WorkflowType[]>("/workflow-types/all");
    return res.data;
  },

  async create(name: string, icon?: string, sortOrder?: number): Promise<WorkflowType> {
    const res = await api.post<WorkflowType>("/workflow-types", { name, icon, sortOrder: sortOrder ?? 99 });
    return res.data;
  },

  async update(id: string, name: string, icon?: string, sortOrder?: number): Promise<WorkflowType> {
    const res = await api.put<WorkflowType>(`/workflow-types/${id}`, { name, icon, sortOrder: sortOrder ?? 99 });
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/workflow-types/${id}`);
  },
};
