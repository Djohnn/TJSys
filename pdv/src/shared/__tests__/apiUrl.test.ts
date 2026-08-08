import { describe, expect, it } from 'vitest';

import { apiUrl, normalizeApiBaseUrl } from '../apiUrl';

describe('normalizeApiBaseUrl', () => {
  it.each([
    ['http://localhost:8000/api/v1/', 'http://localhost:8000/api/v1'],
    ['http://localhost:8000/api/v1///', 'http://localhost:8000/api/v1'],
    ['/api/v1/', '/api/v1'],
    ['/api/v1', '/api/v1'],
  ])('normaliza a base %s', (baseUrl, expected) => {
    expect(normalizeApiBaseUrl(baseUrl)).toBe(expected);
  });
});

describe('apiUrl', () => {
  it.each([
    ['http://localhost:8000/api/v1/', '/devices/refresh/', 'http://localhost:8000/api/v1/devices/refresh/'],
    ['http://localhost:8000/api/v1', 'devices/refresh/', 'http://localhost:8000/api/v1/devices/refresh/'],
    ['/api/v1/', '/devices/refresh/', '/api/v1/devices/refresh/'],
    ['/api/v1', 'devices/refresh/', '/api/v1/devices/refresh/'],
  ])('junta a base %s ao endpoint %s com uma barra', (baseUrl, endpoint, expected) => {
    const result = apiUrl(baseUrl, endpoint);

    expect(result).toBe(expected);
    expect(result.replace(/^https?:\/\//, '')).not.toContain('//');
  });
});
