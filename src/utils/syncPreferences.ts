/** Native sync UX preferences (local to device). */

const MANUAL_DOWNLOAD_KEY = "sync-manual-download-only";

export function getManualDownloadOnly(): boolean {
  try {
    return localStorage.getItem(MANUAL_DOWNLOAD_KEY) === "1";
  } catch {
    return false;
  }
}

export function setManualDownloadOnly(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(MANUAL_DOWNLOAD_KEY, "1");
    else localStorage.removeItem(MANUAL_DOWNLOAD_KEY);
  } catch {
    /* ignore */
  }
}
