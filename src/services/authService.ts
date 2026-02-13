import api from "./api";
import { User } from "../types/user";

export interface LoginPayload {
  email: string;
  password: string;
  trustedDeviceToken?: string;
}

export interface LoginResponse {
  token?: string;
  user?: User;
  isFirstLogin: boolean;
  requires2fa?: boolean;
  twoFactorToken?: string;
  trustedDeviceToken?: string;
  passwordExpired?: boolean;
}

export interface Session {
  id: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
}

export interface LoginHistoryEntry {
  action: string;
  details: string | null;
  ipAddress: string | null;
  timestamp: string;
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

export interface TwoFactorSetupResponse {
  secret: string;
  qrCodeUri: string;
}

export interface RecoveryCodesResponse {
  codes: string[];
}

export const authService = {
  async login(payload: LoginPayload) {
    const response = await api.post<LoginResponse>("/auth/login", payload);
    return response.data;
  },
  async verify2fa(twoFactorToken: string, code: string, rememberDevice = false) {
    const response = await api.post<LoginResponse>("/auth/2fa/login", { twoFactorToken, code, rememberDevice });
    return response.data;
  },
  async useRecoveryCode(twoFactorToken: string, recoveryCode: string, rememberDevice = false) {
    const response = await api.post<LoginResponse>("/auth/2fa/recovery", { twoFactorToken, recoveryCode, rememberDevice });
    return response.data;
  },
  async setup2fa() {
    const response = await api.post<TwoFactorSetupResponse>("/auth/2fa/setup");
    return response.data;
  },
  async confirm2fa(code: string) {
    const response = await api.post<RecoveryCodesResponse>("/auth/2fa/confirm", { code });
    return response.data;
  },
  async disable2fa(password: string) {
    await api.post("/auth/2fa/disable", { password });
  },
  async regenerateCodes(password: string) {
    const response = await api.post<RecoveryCodesResponse>("/auth/2fa/regenerate-codes", { password });
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
  async changePassword(currentPassword: string, newPassword: string) {
    await api.post("/auth/change-password", { currentPassword, newPassword });
  },
  async updateProfile(payload: UpdateProfilePayload) {
    const response = await api.put<User>("/auth/profile", payload);
    return response.data;
  },
  async getSessions() {
    const response = await api.get<Session[]>("/auth/sessions");
    return response.data;
  },
  async revokeSession(id: string) {
    await api.delete(`/auth/sessions/${id}`);
  },
  async revokeAllSessions() {
    await api.post("/auth/sessions/revoke-all");
  },
  async getLoginHistory(limit = 20) {
    const response = await api.get<LoginHistoryEntry[]>(`/auth/login-history?limit=${limit}`);
    return response.data;
  }
};
