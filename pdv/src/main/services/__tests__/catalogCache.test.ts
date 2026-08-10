// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPath: vi.fn(),
  get: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getPath: mocks.getPath },
}));

vi.mock('../api', () => ({
  api: { get: mocks.get },
}));

vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { catalogCache } from '../catalogCache';

const product = {
  id: 'product-1',
  sku: 'SKU-001',
  name: 'Produto 1',
  base_unit: 'unit-1',
  requires_lot: false,
  requires_expiry: false,
  is_active: true,
  updated_at: '2026-08-10T10:00:00Z',
};

const price = {
  id: 'price-1',
  product_id: 'product-1',
  amount: '49.90',
  valid_from: '2026-08-10T09:00:00Z',
  valid_to: '2026-08-31T23:59:59Z',
  updated_at: '2026-08-10T10:00:00Z',
  is_active: true,
};

describe('CatalogCache.syncFromBackend', () => {
  let databaseDirectory: string;

  beforeEach(() => {
    databaseDirectory = mkdtempSync(join(tmpdir(), 'tjsys-catalog-cache-'));
    mocks.getPath.mockReturnValue(databaseDirectory);
    mocks.get.mockReset();
    catalogCache.init();
  });

  afterEach(() => {
    catalogCache.close();
    rmSync(databaseDirectory, { recursive: true, force: true });
  });

  it('Given a product page and price response, When syncing, Then stores the canonical ProductPrice', async () => {
    // Given
    mocks.get.mockImplementation(async (url: string) => {
      if (url === '/products/') {
        return { data: { results: [product], next: null } };
      }
      if (url === '/products/product-1/prices/') {
        return { data: { results: [price] } };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    // When
    const result = await catalogCache.syncFromBackend();

    // Then
    expect(result).toEqual({ products: 1, prices: 1 });
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/products/product-1/prices/', {
      params: { is_active: 'true' },
    });
    expect(catalogCache.getProductById('product-1')).toMatchObject({
      id: 'product-1',
      sku: 'SKU-001',
    });
    expect(catalogCache.getPrice('product-1', new Date('2026-08-15T12:00:00Z'))).toMatchObject({
      id: 'price-1',
      amount: '49.90',
      valid_from: price.valid_from,
      valid_to: price.valid_to,
    });
  });

  it('Given a final product page, When syncing, Then does not request an extra page', async () => {
    // Given
    mocks.get.mockResolvedValue({ data: { results: [product], next: null } });

    // When
    await catalogCache.syncFromBackend();

    // Then
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.get).toHaveBeenNthCalledWith(1, '/products/', {
      params: { page: 1, page_size: 100, is_active: 'true' },
    });
  });

  it('Given a product without prices, When the price list is empty, Then keeps the product without a price row', async () => {
    // Given
    mocks.get.mockImplementation(async (url: string) => {
      if (url === '/products/') {
        return { data: { results: [product], next: null } };
      }
      return { data: { results: [] } };
    });

    // When
    const result = await catalogCache.syncFromBackend();

    // Then
    expect(result).toEqual({ products: 1, prices: 0 });
    expect(catalogCache.getProductById('product-1')).not.toBeNull();
    expect(catalogCache.getPrice('product-1')).toBeNull();
  });
});
