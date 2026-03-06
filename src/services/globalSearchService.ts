import api from "./api";

export type GlobalSearchEntityType =
  | "project"
  | "installation"
  | "asset"
  | "document"
  | "customer"
  | "site"
  | "workInstruction"
  | "workOrder";

export interface GlobalSearchResult {
  id: string;
  entityType: GlobalSearchEntityType;
  entityId: string;
  title: string;
  subtitle?: string | null;
  route: string;
  snippet: string;
  matchedFields: string[];
  score: number;
}

export interface GlobalSearchResponse {
  query: string;
  total: number;
  results: GlobalSearchResult[];
}

export interface SearchDocumentPreviewHit {
  context: string;
  text: string;
}

export interface SearchDocumentPreview {
  entityId: string;
  sourceType: "library" | "asset";
  title: string;
  subtitle?: string | null;
  downloadUrl?: string | null;
  hits: SearchDocumentPreviewHit[];
}

export const globalSearchService = {
  async search(query: string, limit = 60): Promise<GlobalSearchResponse> {
    const response = await api.get<GlobalSearchResponse>("/search", {
      params: { q: query, limit }
    });
    return response.data;
  },

  async getDocumentPreview(
    entityId: string,
    sourceType: "library" | "asset",
    query?: string,
    limit = 200
  ): Promise<SearchDocumentPreview> {
    const response = await api.get<SearchDocumentPreview>("/search/document-preview", {
      params: { entityId, sourceType, q: query, limit }
    });
    return response.data;
  }
};
