// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
}));

vi.mock('../services/api', () => ({
  api: {
    get: mocks.get,
    post: mocks.post,
  },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

import { setupApiHandlers } from '../ipc/api';
import { setupCatalogHandlers } from '../ipc/catalog';

function handlerFor(channel: string) {
  const handler = mocks.handle.mock.calls.find(([registeredChannel]) => registeredChannel === channel)?.[1];
  expect(handler, `handler ${channel} should be registered`).toBeTypeOf('function');
  return handler;
}

describe('Electron integration contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers catalog:products and unwraps the paginated backend catalog', async () => {
    // Given
    mocks.get.mockResolvedValue({
      data: {
        count: 1,
        results: [{
          id: 'product-1',
          sku: 'PDV-001',
          name: 'Produto PDV',
          base_unit: 'unit-1',
          requires_lot: false,
          requires_expiry: false,
        }],
      },
    });
    setupCatalogHandlers();

    // When
    const result = await handlerFor('catalog:products')({}, { search: 'PDV', page: 2 });

    // Then
    expect(mocks.get).toHaveBeenCalledWith('/products/', {
      params: { search: 'PDV', page: 2 },
    });
    expect(result).toEqual({
      success: true,
      data: [{
        id: 'product-1',
        sku: 'PDV-001',
        name: 'Produto PDV',
        base_unit: 'unit-1',
        requires_lot: false,
        requires_expiry: false,
      }],
    });
  });

  it('preserves the backend validity field names in product price results', async () => {
    // Given
    mocks.get.mockResolvedValue({
      data: {
        results: [{
          id: 'price-1',
          amount: '49.90',
          valid_from: '2026-08-10T10:00:00Z',
          valid_to: null,
        }],
      },
    });
    setupApiHandlers();

    // When
    const result = await handlerFor('catalog:product-prices')({}, 'product-1');

    // Then
    expect(result).toEqual({
      success: true,
      data: [{
        id: 'price-1',
        amount: '49.90',
        valid_from: '2026-08-10T10:00:00Z',
        valid_to: null,
      }],
    });
  });
});
