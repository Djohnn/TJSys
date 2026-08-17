export interface PaginatedResponse<T> {
  results: T[];
}

export function unwrapResults<T>(data: T[] | PaginatedResponse<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}
