export function normalizeApiBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export function apiUrl(baseUrl: string, endpoint: string): string {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  const normalizedEndpoint = endpoint.replace(/^\/+/, '');

  return `${normalizedBaseUrl}/${normalizedEndpoint}`;
}
