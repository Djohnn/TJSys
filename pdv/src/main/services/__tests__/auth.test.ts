import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ post: vi.fn() }));
const storageMocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));

vi.mock('../api', () => ({ api: apiMocks }));
vi.mock('../../utils/storage', () => storageMocks);

import { auth } from '../auth';

const deviceContext = {
  token: 'access-token',
  refresh_token: 'refresh-token',
  device_id: 'device-1',
  tenant_id: 'tenant-1',
  branch_id: 'branch-1',
};

describe('contexto de autenticação do dispositivo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.getItem.mockReturnValue('refresh-token');
  });

  it('persiste tenant junto com o contexto retornado no validateApiKey', async () => {
    apiMocks.post.mockResolvedValue({ data: deviceContext });

    await auth.validateApiKey('device-api-key');

    expect(storageMocks.setItem.mock.calls).toEqual([
      ['access_token', 'access-token'],
      ['refresh_token', 'refresh-token'],
      ['device_id', 'device-1'],
      ['branch_id', 'branch-1'],
      ['tenant_id', 'tenant-1'],
      ['api_key', 'device-api-key'],
    ]);
  });

  it('atualiza tenant e demais contexto quando o refresh retorna credenciais novas', async () => {
    const refreshedContext = { ...deviceContext, tenant_id: 'tenant-2', branch_id: null };
    apiMocks.post.mockResolvedValue({ data: refreshedContext });

    await auth.refreshToken();

    expect(storageMocks.setItem.mock.calls).toEqual([
      ['access_token', 'access-token'],
      ['refresh_token', 'refresh-token'],
      ['device_id', 'device-1'],
      ['branch_id', ''],
      ['tenant_id', 'tenant-2'],
    ]);
  });
});
