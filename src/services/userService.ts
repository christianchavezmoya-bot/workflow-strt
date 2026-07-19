import api from "./api";
import { User, UserRole } from "../types/user";
import { isMobileNativePlatform } from "../utils/platform";
import { referenceDataGet, referenceDataSet, syncMetaSet } from "./localDB";
import { shouldSkipBlockingFetch } from "./connectivityMonitor";

const USERS_REF_KEY = "users";

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
    if (!isMobileNativePlatform()) {
      const response = await api.get<User[]>("/users");
      return response.data;
    }

    const cached = await referenceDataGet<User[]>(USERS_REF_KEY);

    if (cached && cached.length > 0) {
      if (!shouldSkipBlockingFetch()) {
        void api.get<User[]>("/users")
          .then(async (response) => {
            await referenceDataSet(USERS_REF_KEY, response.data);
            await syncMetaSet("users");
            // Tell the UI the background refresh landed. Without this the caller
            // already rendered the cached list and had no way to learn newer data
            // had arrived, so a one-shot page load stayed stale until a manual
            // reload.
            //
            // Only fire when the data actually CHANGED. That keeps a routine
            // refresh from re-rendering every consumer, and it is what stops the
            // central listener (store/index.ts re-dispatches fetchUsers) from
            // looping: the refetch it triggers finds identical data and goes quiet.
            if (JSON.stringify(response.data) !== JSON.stringify(cached)) {
              window.dispatchEvent(new Event("repo:users:updated"));
            }
          })
          .catch(() => {});
      }
      return cached;
    }

    if (shouldSkipBlockingFetch()) return [];

    try {
      const response = await api.get<User[]>("/users");
      await referenceDataSet(USERS_REF_KEY, response.data);
      await syncMetaSet("users");
      return response.data;
    } catch {
      return cached ?? [];
    }
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
