import api from "../../../services/api";

export const documentsAdapter = {
  async attachSourceWorkbook(projectId: string, fileName: string, fileRef: string): Promise<void> {
    await api.post(`/project-assets/${projectId}/documents`, {
      fileName,
      fileRef,
      documentType: "BOM Source",
      generatedByModule: true,
    });
  },

  async attachGeneratedInstallPack(assetId: string, documentRef: string): Promise<void> {
    await api.post(`/project-assets/${assetId}/documents`, {
      fileName: "Install Pack",
      fileRef: documentRef,
      documentType: "Install Pack",
      generatedByModule: true,
    });
  },
};
