export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ProjectAssetPageQuery {
  page?: number;
  pageSize?: number;
  sort?: string;
  search?: string;
  includeDeleted?: boolean;
}
