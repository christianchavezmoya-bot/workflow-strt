import api from "./api";
import { User } from "../types/user";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
  isFirstLogin: boolean;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  newPassword: string;
}

export interface UpdateProfilePayload {
  fullName: string;
  office: string;
}

export const authService = {
  async login(payload: LoginPayload) {
    const response = await api.post<LoginResponse>("/auth/login", payload);
    return response.data;
  },
  async getProfile() {
    const response = await api.get<User>("/auth/profile");
    return response.data;
  },
  async forgotPassword(payload: ForgotPasswordPayload) {
    const response = await api.post("/auth/forgot-password", payload);
    return response.data;
  },
  async resetPassword(payload: ResetPasswordPayload) {
    const response = await api.post("/auth/reset-password", payload);
    return response.data;
  },
  async updateProfile(payload: UpdateProfilePayload) {
    const response = await api.put<User>("/auth/profile", payload);
    return response.data;
  }
};
