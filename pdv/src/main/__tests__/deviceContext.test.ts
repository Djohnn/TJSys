// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  validateApiKey: vi.fn(),
  refreshToken: vi.fn(),
}));

vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }));
vi.mock('../services/auth', () => ({
  auth: {
    validateApiKey: mocks.validateApiKey,
    refreshToken: mocks.refreshToken,
  },
}));
vi.mock('../services/api', () => ({ api: { post: vi.fn() } }));
vi.mock('../utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

import { setupDeviceHandlers } from '../ipc/device';

function handlerFor(channel: string) {
  const handler = mocks.handle.mock.calls.find(([registeredChannel]) => registeredChannel === channel)?.[1];
  expect(handler, `handler ${channel} should be registered`).toBeTypeOf('function');
  return handler;
}

describe('contexto de autenticação dos handlers de dispositivo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('usa o serviço de autenticação persistente ao validar o dispositivo', async () => {
    const response = { token: 'access', refresh_token: 'refresh', device_id: 'device', tenant_id: 'tenant', branch_id: null };
    mocks.validateApiKey.mockResolvedValue(response);
    setupDeviceHandlers();

    await expect(handlerFor('device:validate')({}, 'api-key')).resolves.toEqual({ success: true, data: response });
    expect(mocks.validateApiKey).toHaveBeenCalledWith('api-key');
  });

  it('usa o serviço de refresh persistente ao renovar o dispositivo', async () => {
    const response = { token: 'access', refresh_token: 'refresh', device_id: 'device', tenant_id: 'tenant', branch_id: 'branch' };
    mocks.refreshToken.mockResolvedValue(response);
    setupDeviceHandlers();

    await expect(handlerFor('device:refresh')({})).resolves.toEqual({ success: true, data: response });
    expect(mocks.refreshToken).toHaveBeenCalledOnce();
  });
});
