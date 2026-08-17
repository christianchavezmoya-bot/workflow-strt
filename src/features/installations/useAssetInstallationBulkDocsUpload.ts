import { useCallback, useState } from "react";
import { assetDocumentLinkService } from "../../services/assetDocumentLinkService";
import {
  ASSET_DOCUMENT_LIMIT,
  defaultBulkDocumentName,
  summarizeBulkDocsUploadResult,
  type BulkDocsUploadCounts,
} from "./assetInstallationBulkActions";

type UploadContext = {
  assetIds: string[];
  docsCountMap: Record<string, number>;
  uploadedBy?: string;
  onDocLinked: (assetId: string) => void;
  onComplete: (result: string, clearSelection: boolean) => void;
};

export function useAssetInstallationBulkDocsUpload() {
  const [bulkDocsOpen, setBulkDocsOpen] = useState(false);
  const [bulkDocsFile, setBulkDocsFile] = useState<File | null>(null);
  const [bulkDocsType, setBulkDocsType] = useState("Technical");
  const [bulkDocsName, setBulkDocsName] = useState("");
  const [bulkDocsSaving, setBulkDocsSaving] = useState(false);
  const [bulkDocsResult, setBulkDocsResult] = useState<string | null>(null);

  const openBulkDocsDialog = useCallback(() => {
    setBulkDocsFile(null);
    setBulkDocsType("Technical");
    setBulkDocsName("");
    setBulkDocsResult(null);
    setBulkDocsOpen(true);
  }, []);

  const closeBulkDocsDialog = useCallback(() => {
    if (!bulkDocsSaving) setBulkDocsOpen(false);
  }, [bulkDocsSaving]);

  const selectBulkDocsFile = useCallback((file: File | null) => {
    setBulkDocsFile(file);
    setBulkDocsName((prev) => (prev || (file ? defaultBulkDocumentName(file) : "")));
  }, []);

  const uploadBulkDocsFile = useCallback(
    async (context: UploadContext) => {
      if (!bulkDocsFile) return;

      setBulkDocsSaving(true);
      setBulkDocsResult(null);
      const counts: BulkDocsUploadCounts = { uploaded: 0, skipped: 0, failed: 0 };

      await Promise.all(
        context.assetIds.map(async (assetId) => {
          if ((context.docsCountMap[assetId] ?? 0) >= ASSET_DOCUMENT_LIMIT) {
            counts.skipped++;
            return;
          }
          try {
            await assetDocumentLinkService.uploadAndLink(
              assetId,
              bulkDocsFile,
              bulkDocsType,
              bulkDocsName || defaultBulkDocumentName(bulkDocsFile),
              undefined,
              undefined,
              context.uploadedBy,
            );
            counts.uploaded++;
            context.onDocLinked(assetId);
          } catch {
            counts.failed++;
          }
        }),
      );

      setBulkDocsSaving(false);
      const result = summarizeBulkDocsUploadResult(counts, "skipped (at limit)");
      setBulkDocsResult(result);
      context.onComplete(result, counts.failed === 0);
    },
    [bulkDocsFile, bulkDocsName, bulkDocsType],
  );

  const attachBulkDocsQrUpload = useCallback(
    async (documentId: string, context: UploadContext) => {
      setBulkDocsSaving(true);
      setBulkDocsResult(null);
      const counts: BulkDocsUploadCounts = { uploaded: 0, skipped: 0, failed: 0 };

      await Promise.all(
        context.assetIds.map(async (assetId) => {
          if ((context.docsCountMap[assetId] ?? 0) >= ASSET_DOCUMENT_LIMIT) {
            counts.skipped++;
            return;
          }
          try {
            await assetDocumentLinkService.attach(assetId, documentId, context.uploadedBy);
            counts.uploaded++;
            context.onDocLinked(assetId);
          } catch {
            counts.failed++;
          }
        }),
      );

      setBulkDocsSaving(false);
      const result = summarizeBulkDocsUploadResult(counts, "skipped");
      setBulkDocsResult(result);
      context.onComplete(result, counts.failed === 0);
      setBulkDocsOpen(false);
    },
    [],
  );

  return {
    bulkDocsOpen,
    bulkDocsFile,
    bulkDocsType,
    bulkDocsName,
    bulkDocsSaving,
    bulkDocsResult,
    openBulkDocsDialog,
    closeBulkDocsDialog,
    selectBulkDocsFile,
    setBulkDocsType,
    setBulkDocsName,
    uploadBulkDocsFile,
    attachBulkDocsQrUpload,
  };
}
