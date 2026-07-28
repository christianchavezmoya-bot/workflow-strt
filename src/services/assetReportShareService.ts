import api, { API_BASE_URL } from "./api";

export type AssetReportShareRecipient = {
  email: string;
  name?: string;
};

export type AssetReportShareAttachment = {
  fileName: string;
  contentBase64: string;
};

export type CreateAssetReportSharePayload = {
  projectId?: string;
  jobLabel?: string;
  message?: string;
  recipients: AssetReportShareRecipient[];
  attachments: AssetReportShareAttachment[];
  sendEmail: boolean;
  expiresInHours?: number;
};

export type AssetReportShareEmailResult = {
  email: string;
  success: boolean;
  message?: string | null;
};

export type CreateAssetReportShareResponse = {
  shareId: string;
  shareUrl: string;
  downloadUrl: string;
  expiresAtUtc: string;
  emailResults: AssetReportShareEmailResult[];
};

export type AssetReportShareFile = {
  fileName: string;
  label: string;
};

export type AssetReportShareManifest = {
  shareId: string;
  jobLabel?: string | null;
  expiresAtUtc: string;
  files: AssetReportShareFile[];
  downloadUrl: string;
};

export function assetReportShareFileUrl(shareId: string, fileName: string): string {
  return `${API_BASE_URL}/asset-report-shares/${encodeURIComponent(shareId)}/files/${encodeURIComponent(fileName)}`;
}

export const assetReportShareService = {
  async createShare(payload: CreateAssetReportSharePayload): Promise<CreateAssetReportShareResponse> {
    const response = await api.post<CreateAssetReportShareResponse>("/asset-report-shares", payload);
    return response.data;
  },

  async getManifest(shareId: string): Promise<AssetReportShareManifest> {
    const response = await api.get<AssetReportShareManifest>(`/asset-report-shares/${encodeURIComponent(shareId)}`);
    return response.data;
  },
};
