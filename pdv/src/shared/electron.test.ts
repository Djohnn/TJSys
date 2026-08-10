import { describe, expect, it } from 'vitest';
import { getElectronAPI } from './electron';

describe('browser Electron bridge mock', () => {
  it('returns the complete device token contract with a nullable branch', async () => {
    // Given the browser fallback for the Electron bridge
    const api = getElectronAPI();

    // When authentication and device token channels are invoked
    const loginResult = await api.login('mock-api-key');
    const validationResult = await api.validateDevice('mock-api-key');
    const authRefreshResult = await api.refreshToken();
    const deviceRefreshResult = await api.refreshDeviceToken();

    // Then every token response exposes the backend device-token contract
    const expectedData = {
      token: 'mock-token',
      refresh_token: 'mock-refresh-token',
      device_id: 'mock-device',
      tenant_id: 'mock-tenant',
      branch_id: null,
    };
    expect(loginResult).toEqual({ success: true, data: expectedData });
    expect(validationResult).toEqual({ success: true, data: expectedData });
    expect(authRefreshResult).toEqual({ success: true, data: expectedData });
    expect(deviceRefreshResult).toEqual({ success: true, data: expectedData });
  });

  it('exposes the preload channels with valid typed sale data', async () => {
    const api = getElectronAPI();

    expect(api.printFiscalReceipt).toBeTypeOf('function');
    expect(api.printBalcaoReceipt).toBeTypeOf('function');
    expect(api.catalogSync).toBeTypeOf('function');
    expect(api.getProductBySkuCache).toBeTypeOf('function');

    const saleResult = await api.createSale({
      branch: 'mock-branch',
      stock_location: 'mock-stock-location',
      items: [],
      payments: [],
    });
    expect(saleResult.success).toBe(true);
    if (saleResult.success) {
      expect(saleResult.data.branch).toEqual({
        id: 'mock-branch',
        name: 'Mock Branch',
        code: 'MOCK',
      });
    }
  });
});
