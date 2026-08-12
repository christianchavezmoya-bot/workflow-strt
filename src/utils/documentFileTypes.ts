/** Shared upload accept strings and preview routing helpers for documents/tips. */

/** Library document upload (Documents page, asset document links). */
export const DOCUMENT_LIBRARY_UPLOAD_ACCEPT =
  ".pdf,.xlsx,.xls,.docx,.doc,.json,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv";

/** Tips & Tricks + QR/mobile upload — library types plus field media and CAD. */
export const TIPS_UPLOAD_ACCEPT =
  "image/*,video/*,application/pdf,.dwg,.dxf," +
  ".pdf,.xlsx,.xls,.docx,.doc,.json,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv";

/** Extensions that cannot be rendered in-app; show download guidance instead. */
export const PREVIEW_DOWNLOAD_ONLY_EXTENSIONS = new Set(["doc", "dwg", "dxf"]);

export function getFileExtension(name?: string | null): string | undefined {
  return name?.split(".").pop()?.toLowerCase();
}

export function isDownloadOnlyPreviewExtension(ext?: string | null): boolean {
  return !!ext && PREVIEW_DOWNLOAD_ONLY_EXTENSIONS.has(ext);
}
