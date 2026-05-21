import api from "./api";
import type { WorkflowType } from "../types/workflowType";

export const workflowTypeService = {
  async list(): Promise<WorkflowType[]> {
    const res = await api.get<WorkflowType[]>("/workflow-types");
    return res.data;
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
