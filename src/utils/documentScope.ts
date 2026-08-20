import type { DocumentRecord } from "../services/documentService";

/** Document type stored for Tips & Tricks rows. */
export const TIPS_DOCUMENT_TYPE = "tips";

/**
 * Types persisted in the shared Documents table but not shown on the Documents
 * library page (workflow/issue/asset uploads, tips, etc.).
 */
export const NON_LIBRARY_DOCUMENT_TYPES = new Set<string>([
  TIPS_DOCUMENT_TYPE,
  "issue-photo",
  "workflow-evidence",
  "workflow-media",
  "asset-document",
]);

export function isTipsDocument(doc: Pick<DocumentRecord, "type">): boolean {
  return (doc.type ?? "").trim().toLowerCase() === TIPS_DOCUMENT_TYPE;
}

export function isDocumentsLibraryDocument(doc: Pick<DocumentRecord, "type">): boolean {
  const type = (doc.type ?? "").trim().toLowerCase();
  if (!type) return false;
  return !NON_LIBRARY_DOCUMENT_TYPES.has(type);
}

export function filterDocumentsForTips(all: DocumentRecord[]): DocumentRecord[] {
  return all.filter(isTipsDocument);
}

export function filterDocumentsForLibrary(all: DocumentRecord[]): DocumentRecord[] {
  return all.filter(isDocumentsLibraryDocument);
}
