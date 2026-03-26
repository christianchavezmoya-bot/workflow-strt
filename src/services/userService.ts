import api from "./api";
import { User, UserRole } from "../types/user";

export interface CreateUserPayload {
  fullName: string;
  email: string;
  role: UserRole;
  office: User["office"];
}

export interface UpdateUserPayload {
  fullName?: string;
  email?: string;
  role?: UserRole;
  office?: User["office"];
  isActive?: boolean;
  isFirstLogin?: boolean;
}

export const userService = {
  async getUsers() {
    const response = await api.get<User[]>("/users");
    return response.data;
  },
  async createUser(payload: CreateUserPayload) {
    const response = await api.post<User>("/users", payload);
    return response.data;
  },
  async updateUser(id: string, payload: UpdateUserPayload) {
    const response = await api.put<User>(`/users/${id}`, payload);
    return response.data;
  },
  async deactivateUser(id: string) {
    const response = await api.patch<User>(`/users/${id}`, { isActive: false });
    return response.data;
  },
  async inviteUser(id: string) {
    await api.post(`/users/${id}/invite`);
  },
  async deleteUser(id: string) {
    await api.delete(`/users/${id}`);
    return id;
  },
  async resetOnboarding(id: string) {
    const response = await api.put<User>(`/users/${id}`, { isFirstLogin: true });
    return response.data;
  },
  async reset2fa(id: string) {
    const response = await api.post<User>(`/users/${id}/reset-2fa`);
    return response.data;
  }
};
