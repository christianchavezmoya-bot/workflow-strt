export type UploadTokenErrorInfo = {
  status?: number;
  data?: unknown;
  code?: string;
};

function serverMessage(data: unknown): string | null {
  if (typeof data === "string" && data.trim()) return data.trim();
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["message", "error", "title", "detail"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

/**
 * Turns a failed `POST /mobile-upload/token` into a message that says what to do.
 * Auth expiry, permission, server fault and no-network all failed with the same
 * "is the server running?" text before, which is only correct for the last one.
 */
export function describeUploadTokenError(info: UploadTokenErrorInfo): string {
  const { status, data, code } = info;

  if (status === 401) {
    return "Your session expired. Sign in again, then reopen this dialog.";
  }
  if (status === 403) {
    return "Your role cannot upload files. Ask an Admin for upload permission.";
  }
  if (status === 404) {
    return "Upload endpoint not found. The API may be running an older build.";
  }
  if (status === 413) {
    return "The request was rejected as too large by the server or proxy.";
  }
  if (typeof status === "number" && status >= 500) {
    const detail = serverMessage(data);
    return detail
      ? `Server error while creating the upload code: ${detail}`
      : `Server error (${status}) while creating the upload code. Check the API logs.`;
  }
  if (typeof status === "number" && status >= 400) {
    const detail = serverMessage(data);
    return detail ?? `Request rejected (${status}) while creating the upload code.`;
  }

  if (code === "ECONNABORTED" || code === "ETIMEDOUT") {
    return "The API did not respond in time. Check the connection and try again.";
  }

  return "Could not reach the API to create an upload code. Check that the server is running.";
}
