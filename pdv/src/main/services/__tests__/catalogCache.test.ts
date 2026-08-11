// @vitest-environment node
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPath: vi.fn(),
  get: vi.fn(),
  getItem: vi.fn(),
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

vi.mock('../../utils/storage', () => ({
  getItem: () => mocks.getItem(),
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
    mocks.getItem.mockReturnValue('tenant-a');
    catalogCache.init('tenant-a');
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
      params: { page_size: 100, is_active: 'true' },
    });
  });

  it('Given cursor pagination, When syncing, Then follows next URLs without incrementing page', async () => {
    // Given
    const secondProduct = { ...product, id: 'product-2', sku: 'SKU-002' };
    mocks.get.mockImplementation(async (url: string, config?: { params?: unknown }) => {
      if (url === '/products/' && config?.params) {
        return { data: { results: [product], next: 'https://api.test/products/?cursor=next' } };
      }
      if (url === 'https://api.test/products/?cursor=next') {
        return { data: { results: [secondProduct], next: null } };
      }
      return { data: { results: [] } };
    });

    // When
    await catalogCache.syncFromBackend();

    // Then
    expect(mocks.get).toHaveBeenNthCalledWith(1, '/products/', {
      params: { page_size: 100, is_active: 'true' },
    });
    expect(mocks.get).toHaveBeenNthCalledWith(3, 'https://api.test/products/?cursor=next');
    expect(catalogCache.getProductById('product-2')).not.toBeNull();
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

  it('Given a cached product in tenant A, When tenant B syncs, Then tenant A data is not visible', async () => {
    // Given
    mocks.get.mockImplementation(async (url: string) => {
      if (url === '/products/') return { data: { results: [product], next: null } };
      return { data: { results: [price] } };
    });
    await catalogCache.syncFromBackend();
    expect(catalogCache.getProductById('product-1')).not.toBeNull();

    // When
    mocks.getItem.mockReturnValue('tenant-b');
    mocks.get.mockResolvedValue({ data: { results: [], next: null } });
    await catalogCache.syncFromBackend();

    // Then
    expect(catalogCache.getProductById('product-1')).toBeNull();
    expect(catalogCache.searchProducts('SKU-001')).toEqual([]);
  });

  it('Given an old cached price, When refresh returns an empty price list, Then removes obsolete prices', async () => {
    // Given
    mocks.get.mockImplementationOnce(async () => ({ data: { results: [product], next: null } }))
      .mockImplementationOnce(async () => ({ data: { results: [price] } }));
    await catalogCache.syncFromBackend();
    expect(catalogCache.getPrice('product-1', new Date('2026-08-15T12:00:00Z'))).not.toBeNull();

    // When
    mocks.get.mockImplementationOnce(async () => ({ data: { results: [product], next: null } }))
      .mockImplementationOnce(async () => ({ data: { results: [] } }));
    await catalogCache.syncFromBackend();

    // Then
    expect(catalogCache.getPrice('product-1', new Date('2026-08-15T12:00:00Z'))).toBeNull();
  });

  it('Given a valid cached price, When price refresh fails, Then preserves the valid cache', async () => {
    // Given
    mocks.get.mockImplementationOnce(async () => ({ data: { results: [product], next: null } }))
      .mockImplementationOnce(async () => ({ data: { results: [price] } }));
    await catalogCache.syncFromBackend();

    // When
    mocks.get.mockImplementationOnce(async () => ({ data: { results: [product], next: null } }))
      .mockImplementationOnce(async () => { throw new Error('backend unavailable'); });
    await catalogCache.syncFromBackend();

    // Then
    expect(catalogCache.getPrice('product-1', new Date('2026-08-15T12:00:00Z'))).toMatchObject({ id: 'price-1' });
  });

  it('Given an existing snapshot, When a later product page fails, Then commits no partial refresh', async () => {
    // Given
    mocks.get.mockImplementationOnce(async () => ({ data: { results: [product], next: null } }))
      .mockImplementationOnce(async () => ({ data: { results: [price] } }));
    await catalogCache.syncFromBackend();
    const replacement = { ...product, id: 'product-2', sku: 'SKU-002' };
    mocks.get.mockImplementationOnce(async () => ({ data: { results: [replacement], next: 'cursor-2' } }))
      .mockImplementationOnce(async () => { throw new Error('page unavailable'); });

    // When
    const result = await catalogCache.syncFromBackend();

    // Then
    expect(result).toEqual({ products: 0, prices: 0 });
    expect(catalogCache.getProductById('product-1')).not.toBeNull();
    expect(catalogCache.getProductById('product-2')).toBeNull();
    expect(catalogCache.getPrice('product-1', new Date('2026-08-15T12:00:00Z'))).toMatchObject({ id: 'price-1' });
  });

  it('Given two refresh calls, When the first is still fetching, Then the second runs after it', async () => {
    // Given
    let releaseFirst!: () => void;
    const firstPage = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let calls = 0;
    mocks.get.mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        await firstPage;
        return { data: { results: [product], next: null } };
      }
      if (calls === 2) return { data: { results: [] } };
      if (calls === 3) return { data: { results: [{ ...product, id: 'product-2', sku: 'SKU-002' }], next: null } };
      return { data: { results: [] } };
    });

    // When
    const first = catalogCache.syncFromBackend();
    const second = catalogCache.syncFromBackend();
    await Promise.resolve();
    expect(calls).toBe(1);
    releaseFirst();
    await first;
    await second;

    // Then
    expect(calls).toBe(4);
    expect(catalogCache.getProductById('product-2')).not.toBeNull();
  });

  it('Given tenant A has a pending refresh, When init switches to tenant B, Then discards A without writing B', async () => {
    // Given
    let releaseFirstPage!: () => void;
    const firstPage = new Promise<void>((resolve) => { releaseFirstPage = resolve; });
    mocks.get.mockImplementation(async (url: string) => {
      if (url === '/products/') {
        await firstPage;
        return { data: { results: [product], next: null } };
      }
      if (url === '/products/product-1/prices/') {
        return { data: { results: [price] } };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    // When
    const refreshA = catalogCache.syncFromBackend();
    await Promise.resolve();
    mocks.getItem.mockReturnValue('tenant-b');
    catalogCache.init('tenant-b');
    releaseFirstPage();
    const result = await refreshA;

    // Then
    expect(result).toEqual({ products: 0, prices: 0 });
    expect(catalogCache.getProductById('product-1')).toBeNull();
    expect(catalogCache.getPrice('product-1')).toBeNull();
  });

  it('Given an old product in the same tenant, When the snapshot omits it, Then removes the obsolete product', async () => {
    // Given
    mocks.get.mockImplementationOnce(async () => ({ data: { results: [product], next: null } }))
      .mockImplementationOnce(async () => ({ data: { results: [] } }));
    await catalogCache.syncFromBackend();
    expect(catalogCache.getProductById('product-1')).not.toBeNull();

    // When
    mocks.get.mockResolvedValue({ data: { results: [], next: null } });
    await catalogCache.syncFromBackend();

    // Then
    expect(catalogCache.getProductById('product-1')).toBeNull();
  });

  it('Given an unscoped legacy database, When initializing a tenant, Then preserves it without importing rows', () => {
    // Given
    catalogCache.close();
    const legacyPath = join(databaseDirectory, 'catalog.db');
    const legacyDb = new Database(legacyPath);
    legacyDb.exec('CREATE TABLE products (id TEXT PRIMARY KEY, sku TEXT, name TEXT, base_unit_id TEXT, requires_lot INTEGER, requires_expiry INTEGER, is_active INTEGER, updated_at TEXT)');
    legacyDb.prepare('INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('legacy-product', 'LEGACY', 'Legado', 'unit-1', 0, 0, 1, '2026-08-10T00:00:00Z');
    legacyDb.close();

    // When
    catalogCache.init('tenant-a');

    // Then
    expect(catalogCache.getProductById('legacy-product')).toBeNull();
    expect(existsSync(join(databaseDirectory, 'catalog.db'))).toBe(true);
    expect(existsSync(join(databaseDirectory, 'catalog-legacy-unscoped.db'))).toBe(true);
  });
});
