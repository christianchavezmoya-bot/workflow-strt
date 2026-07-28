import api from "./api";

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
  expiresAtUtc: string;
  emailResults: AssetReportShareEmailResult[];
};

export const assetReportShareService = {
  async createShare(payload: CreateAssetReportSharePayload): Promise<CreateAssetReportShareResponse> {
    const response = await api.post<CreateAssetReportShareResponse>("/asset-report-shares", payload);
    return response.data;
  },
};
