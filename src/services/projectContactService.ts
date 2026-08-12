import api from "./api";
import type {
  ProjectContact,
  ProjectInboundItem
} from "../types/projectContact";

// ─── Contacts ─────────────────────────────────────────────────────────────────

type ContactPayload = Omit<ProjectContact, "id" | "projectId" | "createdAt">;
type InboundPayload = Omit<ProjectInboundItem, "id" | "projectId" | "createdAt">;

export const projectContactService = {
  async listContacts(projectId: string): Promise<ProjectContact[]> {
    const r = await api.get<ProjectContact[]>("/project-contacts", {
      params: { projectId }
    });
    return r.data;
  },

  async createContact(projectId: string, data: ContactPayload): Promise<ProjectContact> {
    const r = await api.post<ProjectContact>("/project-contacts", data, {
      params: { projectId }
    });
    return r.data;
  },

  async updateContact(id: string, data: ContactPayload): Promise<ProjectContact> {
    const r = await api.put<ProjectContact>(`/project-contacts/${id}`, data);
    return r.data;
  },

  async deleteContact(id: string): Promise<void> {
    await api.delete(`/project-contacts/${id}`);
  },

  // ─── Inbound Items ──────────────────────────────────────────────────────────

  async listInboundItems(projectId: string): Promise<ProjectInboundItem[]> {
    const r = await api.get<ProjectInboundItem[]>("/project-inbound-items", {
      params: { projectId }
    });
    return r.data;
  },

  async createInboundItem(projectId: string, data: InboundPayload): Promise<ProjectInboundItem> {
    const r = await api.post<ProjectInboundItem>("/project-inbound-items", data, {
      params: { projectId }
    });
    return r.data;
  },

  async updateInboundItem(id: string, data: InboundPayload): Promise<ProjectInboundItem> {
    const r = await api.put<ProjectInboundItem>(`/project-inbound-items/${id}`, data);
    return r.data;
  },

  async deleteInboundItem(id: string): Promise<void> {
    await api.delete(`/project-inbound-items/${id}`);
  }
};
